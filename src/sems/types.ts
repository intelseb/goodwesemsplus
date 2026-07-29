export type SemsSession = {
  uid: string;
  token: string;
  timestamp: string;
  api: string;
  region: string;
  uuid: string;
  client: string;
  version: string;
  language: string;
};

export type StationDetail = {
  stationId: string;
  stationName?: string;
  stationType?: number;
  fromLogin?: boolean;
};

export type PvStatus = {
  date: string;
  time: string;
  v1?: number;
  v2?: number;
  v3?: number;
  v4?: number;
  v5?: number;
  v6?: number;
};

export function statusKey(status: Pick<PvStatus, "date" | "time">): string {
  return `${status.date}|${status.time}`;
}

export function sessionTokenHeader(session: SemsSession): string {
  return JSON.stringify({
    uid: session.uid,
    timestamp: session.timestamp,
    token: session.token,
    client: session.client,
    version: session.version,
    language: session.language,
    api: session.api,
    region: session.region,
    uuid: session.uuid,
  });
}
