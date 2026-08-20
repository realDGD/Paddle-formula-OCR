export {};

declare global {
  interface Window {
    DetexifyClassifier: {
      classify(strokes: Array<Array<{ x: number; y: number }>>, dataset: any[], limit: number): Array<{ item?: any }>;
    };
    FormulaLatexEditor?: {
      create(textarea: HTMLTextAreaElement, host: HTMLElement): any;
    };
    FormulaOcrLatexFormatter?: {
      format(value: string): {
        changed: boolean;
        formatted: string;
        safe: boolean;
        status: string;
      };
      hasEquivalentTokens(original: string, formatted: string): boolean;
    };
    FormulaOcrMathLiveMacros?: Record<string, unknown>;
    FormulaOcrTools?: any;
    MathfieldElement?: any;
    MathLive?: {
      validateLatex(value: string, options?: Record<string, unknown>): Array<Record<string, any>>;
    };
    mathVirtualKeyboard?: { hide(): void };
  }
}
