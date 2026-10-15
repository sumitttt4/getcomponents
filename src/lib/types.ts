export type Category = 'Buttons' | 'Inputs' | 'Cards' | 'Navigation' | 'Badges' | 'Other';
export type Viewport = 'desktop' | 'mobile';
export type CapturedState = 'default' | 'hover' | 'focus';
export interface Snapshot {
  variant: string;
  html: string;
  css: string;
  width: number;
  height: number;
  background: string;
  state: CapturedState;
  viewport: Viewport;
  screenshot?: string;
  pixelDifference: number | null;
  notes: string[];
}
export interface ComponentEntry {
  id: string;
  name: string;
  category: Category;
  signature: string;
  instances: number;
  selector: string;
  accessibility?: string;
  confidence: 'Semantic match' | 'Repeated structure' | 'Heuristic match';
  snapshots: Snapshot[];
  notes: string[];
}
export interface Catalogue {
  kind: 'extraction' | 'fixture';
  url: string;
  title: string;
  createdAt: string;
  components: ComponentEntry[];
  warnings: string[];
  durationMs: number;
  scanned: number;
}
export interface Job {
  id: string;
  status: 'queued' | 'running' | 'complete' | 'failed' | 'cancelled';
  stage: string;
  progress: number;
  createdAt: string;
  result?: Catalogue;
  error?: string;
}
