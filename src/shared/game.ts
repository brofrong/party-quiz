export type PersistedSession =
  | { status: "lobby" }
  | { status: "playing"; quizId: string; state: unknown };

export type PlayerSnapshot =
  | { status: "lobby"; online: number }
  | {
      status: "playing";
      quizId: string;
      quizType: string;
      rev: number;
      online: number;
      view: unknown;
    };

export type HostSnapshot =
  | { status: "lobby"; online: number }
  | {
      status: "playing";
      quizId: string;
      quizType: string;
      title: string;
      rev: number;
      online: number;
      view: unknown;
    };
