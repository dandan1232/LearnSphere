import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type { Attempt, Quiz, SourceDocument, TutorThread } from "@/lib/domain/models";

interface LearnSphereDatabase extends DBSchema {
  sources: {
    key: string;
    value: SourceDocument;
    indexes: { "by-imported-at": string };
  };
  quizzes: {
    key: string;
    value: Quiz;
    indexes: { "by-created-at": string };
  };
  attempts: {
    key: string;
    value: Attempt;
    indexes: { "by-updated-at": string; "by-quiz-id": string };
  };
  tutorThreads: {
    key: string;
    value: TutorThread;
    indexes: { "by-attempt-id": string };
  };
}

const DATABASE_NAME = "learnsphere";
const DATABASE_VERSION = 1;

let databasePromise: Promise<IDBPDatabase<LearnSphereDatabase>> | undefined;

function openDatabase() {
  if (typeof indexedDB === "undefined") {
    throw new Error("当前浏览器不支持本地学习记录存储。");
  }

  databasePromise ??= openDB<LearnSphereDatabase>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(database) {
      const sourceStore = database.createObjectStore("sources", { keyPath: "id" });
      sourceStore.createIndex("by-imported-at", "importedAt");

      const quizStore = database.createObjectStore("quizzes", { keyPath: "id" });
      quizStore.createIndex("by-created-at", "createdAt");

      const attemptStore = database.createObjectStore("attempts", { keyPath: "id" });
      attemptStore.createIndex("by-updated-at", "updatedAt");
      attemptStore.createIndex("by-quiz-id", "quizId");

      const tutorStore = database.createObjectStore("tutorThreads", { keyPath: "id" });
      tutorStore.createIndex("by-attempt-id", "attemptId");
    },
  });

  return databasePromise;
}

export async function putSource(source: SourceDocument) {
  return (await openDatabase()).put("sources", source);
}

export async function getSource(id: string) {
  return (await openDatabase()).get("sources", id);
}

export async function putQuiz(quiz: Quiz) {
  return (await openDatabase()).put("quizzes", quiz);
}

export async function getQuiz(id: string) {
  return (await openDatabase()).get("quizzes", id);
}

export async function putAttempt(attempt: Attempt) {
  return (await openDatabase()).put("attempts", attempt);
}

export async function getAttempt(id: string) {
  return (await openDatabase()).get("attempts", id);
}

export async function listAttempts() {
  const attempts = await (await openDatabase()).getAll("attempts");
  return attempts.toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function putTutorThread(thread: TutorThread) {
  return (await openDatabase()).put("tutorThreads", thread);
}

export async function getTutorThread(id: string) {
  return (await openDatabase()).get("tutorThreads", id);
}

export async function listTutorThreadsForAttempt(attemptId: string) {
  return (await openDatabase()).getAllFromIndex("tutorThreads", "by-attempt-id", attemptId);
}

export function resetDatabaseConnectionForTests() {
  databasePromise = undefined;
}
