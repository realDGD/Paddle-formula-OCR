export type JsonObject = Record<string, any>;

export type ApiConfiguration = {
  port: string;
  requestTimeout: number;
  token: string;
};

export type StatusSetter = (
  message: string,
  error?: boolean,
  phase?: string,
) => void;

export type VisualStatusSetter = (message: string, level?: string | boolean) => void;

export type RecognitionKind = 'formula' | 'table';
export type JobStatus = 'queued' | 'loading_model' | 'running' | 'succeeded' | 'failed' | 'timed_out' | 'cancelled';
export type WorkbenchPage = 'ocr' | 'editor' | 'table-ocr' | 'table-editor';

export type TableResult = {
  html: string;
  markdown: string;
};

type RecognitionJobBase = {
  error_message?: string | null;
  id: string;
  queue_position?: number | null;
  status: JobStatus;
};

export type FormulaJob = RecognitionJobBase & {
  kind: 'formula';
  latex_raw?: string | null;
};

export type TableJob = RecognitionJobBase & {
  kind: 'table';
  tables: TableResult[];
};

export type RecognitionJob = FormulaJob | TableJob;
