export type UploadStatus = 'PROCESSING' | 'READY' | 'FAILED';

export interface UploadSummary {
  uploadId: string;
  fileName: string;
  status: UploadStatus;
  createdAt: string;
}

export interface Flashcard {
  front: string;
  back: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  answerIndex: number;
  topic: string;
}

export interface UploadDetail extends UploadSummary {
  summary?: string;
  topics?: string[];
  flashcards?: Flashcard[];
  quiz?: QuizQuestion[];
  error?: string;
}

export interface MasteryEntry {
  asked: number;
  correct: number;
  partial: number;
  score: number;
}
export type Progress = Record<string, MasteryEntry>;

export interface QuizMeStart {
  sessionId: string;
  question: { text: string; topic: string };
  progress: Progress;
}
export interface QuizMeAnswer {
  grade: 'correct' | 'partial' | 'incorrect';
  explanation: string;
  nextQuestion: { text: string; topic: string };
  progress: Progress;
}
export interface QuizMeEnd {
  summary: string;
  mastery: Record<string, number>;
}
