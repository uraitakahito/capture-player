export type URLResource = {
  mime: string;
  status: string;
  date: Date;
  ts: string;
  url: string;
};

export type Page = {
  id: number;
  title: string;
  text?: string;
  url: string;
  mime: string;
  status: string;
  size: number;

  ts: number;
  timestamp: string;
  date: Date | null;

  favIconUrl?: string;
  waczhash?: string;
  seed?: boolean;
  isSeed?: boolean;
  desc?: string;
};

export type URLTsChange = {
  url?: string;
  ts?: string;
  waczhash?: string;
  currList?: number;
};

export type ItemType = {
  filename?: string;
  sourceUrl: string;
  replayPrefix: string;
  apiPrefix: string;

  /**
   * Archived Item ID
   */
  coll?: string;
  // TODO(emma) is `id` the same as `coll`? should they be merged?
  id?: string;
  name?: string;
  title?: string;
  loadUrl?: string;
  downloadUrl?: string | null;
  desc?: string;
  description?: string;
  resources?: { path: string; name: string }[];
  // capture-player: 2026-11-12 に足した。wabac の src/wacz/browserhive.ts の要約
  browserhive?: {
    profile?: string;
    build?: string;
    browser?: string;
    document?: string;
    snapshots: string[];
    signature?: string;
    viewport?: string;
    complete?: boolean;
    bodyless: number;
    truncated: number;
    unintercepted: number;
    crashed: number;
    examples: string[];
  };
  verify?: {
    numValid?: number;
    numInvalid?: number;
    // capture-player: 2026-11-12 に足した
    numUnsigned?: number;
    domain?: string;
    certFingerprint?: string;
    datapackageHash?: string;
    publicKey?: string;
    software?: string;
  };
  onDemand?: boolean;
  pages: Page[];
  curatedPages: (Page & { list: string })[];
  lists: Page[];
  ctime?: string;
  totalSize?: unknown;
  size?: number | string;
  canQueryPages?: boolean;
  pageCount?: number;
};

export type FavIconEventDetail = {
  icons: {
    rel: string;
    href: string;
  }[];
};

// capture-player: 2026-11-14 に足した（CAPTURE-378）。再生の一番上の文書が送る、乱数の控えの数。
// recorded は選んだ文書の行の draw の数、returned は控えの値を返した呼び出し、fallback は返さなかった呼び出し
export type RandomCounts = {
  recorded: number;
  returned: number;
  fallback: number;
};
