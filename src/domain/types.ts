/** 麻雀学習帳 — ドメイン型定義（仕様書 §11） */

export const TILE_CODES = [
  '1m', '2m', '3m', '4m', '5m', '0m', '6m', '7m', '8m', '9m',
  '1p', '2p', '3p', '4p', '5p', '0p', '6p', '7p', '8p', '9p',
  '1s', '2s', '3s', '4s', '5s', '0s', '6s', '7s', '8s', '9s',
  '1z', '2z', '3z', '4z', '5z', '6z', '7z',
] as const;

export type TileCode = (typeof TILE_CODES)[number];

export type Suit = 'm' | 'p' | 's' | 'z';
export type Wind = '1z' | '2z' | '3z' | '4z';
export type MeldType = 'chi' | 'pon' | 'openKan' | 'closedKan' | 'addedKan';
export type MeldFrom = 'left' | 'opposite' | 'right';

export type Meld = {
  id: string;
  type: MeldType;
  tiles: TileCode[];
  from: MeldFrom | null;
  calledIndex: number | null;
  addedIndex: number | null;
};

export type ProblemContext = {
  roundWind: Wind | null;
  handNumber: number | null;
  seatWind: Wind | null;
  turn: number | null;
  honba: number | null;
  riichiSticks: number | null;
  ownRank: number | null;
  scores: {
    east: number | null;
    south: number | null;
    west: number | null;
    north: number | null;
  };
};

export type Attachment = {
  id: string;
  dataUrl: string;
  width: number;
  height: number;
};

export type Problem = {
  id: string;
  title: string;
  concealed: TileCode[];
  drawn: TileCode | null;
  melds: Meld[];
  doraIndicators: TileCode[];
  answerEnabled: boolean;
  acceptedDiscards: TileCode[];
  explanation: string;
  privateMemo: string;
  tagIds: string[];
  context: ProblemContext;
  attachments: Attachment[];
  sourceUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type Tag = {
  id: string;
  name: string;
};

export type Understanding = 'unrated' | 'understood' | 'uncertain';

export type StudyState = {
  problemId: string;
  contentRevision: number;
  confirmationCount: number;
  lastConfirmedAt: string | null;
  understanding: Understanding;
  lastReviewedAt: string | null;
  /** テストで最後に回答した日時（正誤問わず） */
  lastSolvedAt?: string | null;
  /** テストで最後に正解した日時 */
  lastCorrectAt?: string | null;
  /** false のときテストに出題しない（未設定は出題する） */
  inTest?: boolean;
};

/** 日別の学習量。キーはローカル日付 YYYY-MM-DD */
export type DailyLog = {
  tested: number;
  confirmed: number;
};

export type AttemptResult = 'correct' | 'incorrect' | 'selfReview';

export type Attempt = {
  id: string;
  problemId: string;
  contentRevision: number;
  sessionId: string;
  questionIndex: number;
  at: string;
  selectedTile: TileCode | null;
  result: AttemptResult;
};

export type Settings = {
  autoSort: boolean;
};

export type Store = {
  schemaVersion: 1;
  revision: number;
  problems: Problem[];
  tags: Tag[];
  study: StudyState[];
  attempts: Attempt[];
  settings: Settings;
  daily?: Record<string, DailyLog>;
};

export const SCHEMA_VERSION = 1 as const;
export const STORAGE_KEY = 'mahjong-study:v1';

export const LIMITS = {
  title: 100,
  explanation: 4000,
  privateMemo: 4000,
  sourceUrl: 2048,
  tagName: 20,
  tagsPerProblem: 10,
  tagsTotal: 200,
  concealedMax: 14,
  drawnMax: 1,
  meldsMax: 4,
  doraMax: 5,
  attachmentsMax: 3,
  attachmentSourceBytes: 10 * 1024 * 1024,
  attachmentTargetBytes: 150 * 1024,
  attachmentLongEdge: 1280,
  storageWarnBytes: 3 * 1024 * 1024,
  storageMaxBytes: 4 * 1024 * 1024,
  backupMaxBytes: 20 * 1024 * 1024,
  shareUrlMaxChars: 8000,
  shareJsonMaxBytes: 64 * 1024,
  searchDebounceMs: 150,
} as const;

export function emptyContext(): ProblemContext {
  return {
    roundWind: null,
    handNumber: null,
    seatWind: null,
    turn: null,
    honba: null,
    riichiSticks: null,
    ownRank: null,
    scores: { east: null, south: null, west: null, north: null },
  };
}

export function emptyStore(): Store {
  return {
    schemaVersion: SCHEMA_VERSION,
    revision: 0,
    problems: [],
    tags: [],
    study: [],
    attempts: [],
    settings: { autoSort: true },
    daily: {},
  };
}
