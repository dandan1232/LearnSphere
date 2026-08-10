import "server-only";

import { createHash } from "node:crypto";

import * as cheerio from "cheerio";
import TurndownService from "turndown";

import type { SourceChapter, SourceDocument, SourceInspection, SourceSection } from "@/lib/domain/models";
import { SourceError } from "@/lib/server/source-errors";
import { safeFetchText, type SafeFetchResult } from "@/lib/server/safe-fetch";

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
});

function stableId(prefix: string, input: string) {
  return `${prefix}-${createHash("sha256").update(input).digest("hex").slice(0, 16)}`;
}

function cleanHeading(value: string) {
  return value
    .replace(/\s+#+\s*$/, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/[*_`]/g, "")
    .trim();
}

function detectLanguage(text: string) {
  const sample = text.slice(0, 12_000);
  const chineseCharacters = sample.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  return chineseCharacters / Math.max(sample.length, 1) > 0.04 ? "zh-CN" : "en";
}

export function markdownToSections(markdown: string, chapterId: string, fallbackTitle: string) {
  const normalized = markdown.replace(/\r\n/g, "\n").trim();
  const headings = [...normalized.matchAll(/^(#{1,6})\s+(.+?)\s*$/gm)];

  if (headings.length === 0) {
    return [
      {
        id: stableId("sec", `${chapterId}:root`),
        chapterId,
        title: fallbackTitle,
        locator: fallbackTitle,
        text: normalized,
      },
    ];
  }

  const sections: SourceSection[] = [];
  for (let index = 0; index < headings.length; index += 1) {
    const match = headings[index];
    const nextMatch = headings[index + 1];
    const title = cleanHeading(match[2]);
    const start = match.index ?? 0;
    const end = nextMatch?.index ?? normalized.length;
    const text = normalized.slice(start, end).trim();
    if (text.length < 40) continue;
    sections.push({
      id: stableId("sec", `${chapterId}:${start}:${title}`),
      chapterId,
      title,
      locator: title,
      text,
    });
  }

  return sections.length > 0
    ? sections
    : [
        {
          id: stableId("sec", `${chapterId}:root`),
          chapterId,
          title: fallbackTitle,
          locator: fallbackTitle,
          text: normalized,
        },
      ];
}

function markdownTitle(markdown: string, fallbackUrl: string) {
  const heading = markdown.match(/^#\s+(.+?)\s*$/m)?.[1];
  if (heading) return cleanHeading(heading);
  const pathname = decodeURIComponent(new URL(fallbackUrl).pathname);
  return pathname.split("/").filter(Boolean).at(-1)?.replace(/\.md$/i, "") || "未命名章节";
}

export function resolveDocsifyDocumentUrl(rawUrl: string) {
  const pageUrl = new URL(rawUrl);
  if (!pageUrl.hash.startsWith("#/")) return null;
  const decodedRoute = decodeURIComponent(pageUrl.hash.slice(2)).split("?")[0].replace(/^\.\//, "");
  if (!decodedRoute) return new URL("README.md", new URL(".", pageUrl)).toString();
  const withExtension = /\.[a-z0-9]+$/i.test(decodedRoute) ? decodedRoute : `${decodedRoute}.md`;
  return new URL(withExtension, new URL(".", pageUrl)).toString();
}

function resolveDocsifyChapterUrl(href: string, baseUrl: URL) {
  const trimmedHref = href.trim();
  if (!trimmedHref || trimmedHref.startsWith("#") || /^(mailto|javascript):/i.test(trimmedHref)) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmedHref)) {
    const externalUrl = new URL(trimmedHref);
    return externalUrl.origin === baseUrl.origin ? externalUrl.toString() : null;
  }

  let route = trimmedHref.split("?")[0].split("#")[0].replace(/^#\//, "").replace(/^\.\//, "");
  if (!route) return null;
  if (!/\.[a-z0-9]+$/i.test(route)) route += ".md";
  return new URL(route, baseUrl).toString();
}

export function parseDocsifySidebar(markdown: string, baseUrl: URL, currentDocumentUrl: string) {
  const chapters: SourceChapter[] = [];
  const seenUrls = new Set<string>();
  for (const line of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const match = line.match(/^(\s*)[-*+]\s+\[([^\]]+)]\(([^)]+)\)/);
    if (!match) continue;
    const url = resolveDocsifyChapterUrl(match[3], baseUrl);
    if (!url) continue;
    const normalizedUrl = new URL(url);
    normalizedUrl.hash = "";
    const normalizedCurrent = new URL(currentDocumentUrl);
    normalizedCurrent.hash = "";
    if (seenUrls.has(normalizedUrl.toString())) continue;
    seenUrls.add(normalizedUrl.toString());
    chapters.push({
      id: stableId("ch", normalizedUrl.toString()),
      title: cleanHeading(match[2]),
      url: normalizedUrl.toString(),
      depth: Math.min(Math.floor(match[1].replace(/\t/g, "  ").length / 2), 6),
      selected: normalizedUrl.toString() === normalizedCurrent.toString(),
    });
  }

  return chapters.slice(0, 160);
}

function githubRawUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  if (url.hostname !== "github.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const blobIndex = parts.indexOf("blob");
  if (blobIndex !== 2 || parts.length < 5) return null;
  const [owner, repository] = parts;
  const branch = parts[3];
  const path = parts.slice(4).join("/");
  return `https://raw.githubusercontent.com/${owner}/${repository}/${branch}/${path}`;
}

function isMarkdownResponse(result: SafeFetchResult) {
  return (
    result.contentType.includes("markdown") ||
    result.contentType === "text/plain" ||
    new URL(result.url).pathname.toLowerCase().endsWith(".md")
  );
}

function htmlToArticle(result: SafeFetchResult) {
  const $ = cheerio.load(result.body);
  $("script,style,noscript,iframe,canvas,svg,form,nav,footer,header").remove();
  const candidates = ["article", "main", "[role='main']", ".markdown-body", ".theme-doc-markdown", ".content"];
  let articleHtml = $("body").html() ?? "";
  let longestText = 0;
  for (const selector of candidates) {
    $(selector).each((_index, element) => {
      const candidate = $(element);
      const textLength = candidate.text().trim().length;
      if (textLength > 300 && textLength > longestText) {
        articleHtml = candidate.html() ?? "";
        longestText = textLength;
      }
    });
  }

  const markdown = turndown.turndown(articleHtml).trim();
  if (markdown.length < 120) {
    throw new SourceError("EMPTY_CONTENT", "没有识别到足够的正文，请尝试粘贴具体章节链接。", 422);
  }

  const title = cleanHeading($("h1").first().text()) || cleanHeading($("title").text()) || "未命名文章";
  return { title, markdown };
}

function discoverHtmlChapters(html: string, pageUrl: string, currentTitle: string) {
  const $ = cheerio.load(html);
  const currentUrl = new URL(pageUrl);
  currentUrl.hash = "";
  const chapters: SourceChapter[] = [];
  const seenUrls = new Set<string>();
  const selectors = [
    ".VPSidebar a[href]",
    ".sidebar a[href]",
    "aside a[href]",
    "nav[aria-label*='sidebar' i] a[href]",
    "[class*='sidebar' i] a[href]",
  ];

  for (const element of $(selectors.join(",")).toArray()) {
    const anchor = $(element);
    const href = anchor.attr("href")?.trim();
    const title = cleanHeading(anchor.text());
    if (!href || title.length < 2 || title.length > 180 || href.startsWith("#")) continue;

    let chapterUrl: URL;
    try {
      chapterUrl = new URL(href, currentUrl);
    } catch {
      continue;
    }
    if (chapterUrl.origin !== currentUrl.origin || !["http:", "https:"].includes(chapterUrl.protocol)) continue;
    chapterUrl.hash = "";
    const normalizedUrl = chapterUrl.toString();
    if (seenUrls.has(normalizedUrl)) continue;
    seenUrls.add(normalizedUrl);
    chapters.push({
      id: stableId("ch", normalizedUrl),
      title,
      url: normalizedUrl,
      depth: Math.min(anchor.parents("ul,ol").length, 6),
      selected: normalizedUrl === currentUrl.toString(),
    });
    if (chapters.length >= 120) break;
  }

  if (!seenUrls.has(currentUrl.toString())) {
    chapters.unshift({
      id: stableId("ch", currentUrl.toString()),
      title: currentTitle,
      url: currentUrl.toString(),
      depth: 0,
      selected: true,
    });
  }

  return chapters;
}

async function inspectDocsify(originalUrl: string, documentUrl: string): Promise<SourceInspection> {
  const documentResult = await safeFetchText(documentUrl);
  const title = markdownTitle(documentResult.body, documentResult.url);
  const currentChapter: SourceChapter = {
    id: stableId("ch", documentResult.url),
    title,
    url: documentResult.url,
    depth: 0,
    selected: true,
  };
  const baseUrl = new URL(".", new URL(originalUrl));
  let chapters = [currentChapter];

  try {
    const sidebarResult = await safeFetchText(new URL("_sidebar.md", baseUrl).toString());
    const sidebarChapters = parseDocsifySidebar(sidebarResult.body, baseUrl, documentResult.url);
    if (sidebarChapters.length > 0) chapters = sidebarChapters;
  } catch {
    // A sidebar is optional; the linked chapter remains usable without one.
  }

  return {
    originalUrl,
    title,
    language: detectLanguage(documentResult.body),
    adapter: "docsify",
    chapters,
    sections: markdownToSections(documentResult.body, currentChapter.id, title),
  };
}

async function inspectSingleDocument(originalUrl: string, fetchUrl: string): Promise<SourceInspection> {
  const result = await safeFetchText(fetchUrl);
  const content = isMarkdownResponse(result) ? { title: markdownTitle(result.body, result.url), markdown: result.body } : htmlToArticle(result);
  const chapter: SourceChapter = {
    id: stableId("ch", result.url),
    title: content.title,
    url: result.url,
    depth: 0,
    selected: true,
  };
  const discoveredChapters = isMarkdownResponse(result)
    ? [chapter]
    : discoverHtmlChapters(result.body, result.url, content.title);
  const adapter: SourceDocument["adapter"] = githubRawUrl(originalUrl)
    ? "github"
    : isMarkdownResponse(result) || discoveredChapters.length > 1
      ? "documentation"
      : "article";

  return {
    originalUrl,
    title: content.title,
    language: detectLanguage(content.markdown),
    adapter,
    chapters: discoveredChapters,
    sections: markdownToSections(content.markdown, chapter.id, content.title),
  };
}

export async function inspectSource(originalUrl: string) {
  const docsifyDocumentUrl = resolveDocsifyDocumentUrl(originalUrl);
  if (docsifyDocumentUrl) return inspectDocsify(originalUrl, docsifyDocumentUrl);
  const rawGithubUrl = githubRawUrl(originalUrl);
  return inspectSingleDocument(originalUrl, rawGithubUrl ?? originalUrl);
}

async function loadChapter(chapter: SourceChapter) {
  const result = await safeFetchText(chapter.url);
  const content = isMarkdownResponse(result) ? result.body : htmlToArticle(result).markdown;
  return markdownToSections(content, chapter.id, chapter.title);
}

export async function loadSelectedSource(
  originalUrl: string,
  title: string,
  language: string,
  adapter: SourceDocument["adapter"],
  selectedChapters: SourceChapter[],
): Promise<SourceDocument> {
  const sectionGroups = await Promise.all(selectedChapters.map(loadChapter));
  const sections = sectionGroups.flat();
  if (sections.length === 0) {
    throw new SourceError("EMPTY_CONTENT", "选中的章节没有可用于出题的正文。", 422);
  }
  const totalCharacters = sections.reduce((sum, section) => sum + section.text.length, 0);
  if (totalCharacters > 1_500_000) {
    throw new SourceError("CONTENT_TOO_LARGE", "所选章节合计内容过长，请减少章节后重试。", 413);
  }
  const contentHash = createHash("sha256")
    .update(sections.map((section) => `${section.locator}\n${section.text}`).join("\n\n"))
    .digest("hex");

  return {
    schemaVersion: 1,
    id: stableId("src", `${originalUrl}:${contentHash}`),
    url: originalUrl,
    title,
    language,
    adapter,
    chapters: selectedChapters.map((chapter) => ({ ...chapter, selected: true })),
    sections,
    contentHash,
    importedAt: new Date().toISOString(),
  };
}
