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
