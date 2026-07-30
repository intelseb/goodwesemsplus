# goodwesemsplus

Polls GoodWe **SEMS+** plant data and uploads generation/consumption (and live voltage/temp when configured) to [PVOutput](https://pvoutput.org).

## Requirements

- Node.js 20+ (includes `npm`)

## Setup

1. Install Node.js 20+ if needed ([nodejs.org](https://nodejs.org/) or your OS package manager, e.g. `sudo apt install nodejs npm` on Debian/Raspberry Pi OS — check the version is 20+).
2. Clone the repo and install packages:

```bash
git clone https://github.com/intelseb/goodwesemsplus.git goodwesemsplus
cd goodwesemsplus
npm install
```

3. Configure env and run:

```bash
cp .env.example .env
# fill EMAIL, PASSWORD, STATION_DETAIL, DEVICE_DETAIL, PVOUTPUT_API, SERVER, etc.
npm run dev
```

Scripts: `npm run dev` (hot reload), `npm start`, `npm test`, `npm run format`, `npm run build`.

## Environment

| Variable             | Description                                                                  |
| -------------------- | ---------------------------------------------------------------------------- |
| `SERVER`             | SEMS+ login region (see table below)                                         |
| `EMAIL` / `PASSWORD` | SEMS+ account                                                                |
| `STATION_DETAIL`     | Base64 station blob from the station detail URL (see below)                  |
| `DEVICE_DETAIL`      | Optional base64 device blob from the device detail URL (live temp/voltage)   |
| `PVOUTPUT_API`       | PVOutput API key                                                             |
| `PVOUTPUT_SYSTEM_ID` | PVOutput system id                                                           |
| `POLL_INTERVAL_MS`   | Poll interval (default `900000` = 15 min)                                    |
| `BACKFILL_DAYS`      | Days to backfill on startup (default `7`)                                    |
| `TIMEZONE`           | IANA timezone (optional; defaults by server)                                 |
| `LOG_LEVEL`          | `info` (default) / `debug` / `warn` / `error` — debug is cyan, info is green |

Do not commit `.env`.

### `STATION_DETAIL` example

In the SEMS+ UI, open a station. The URL looks like:

```text
https://au-semsplus.goodwe.com/#/station_monitor/station_detail?eyJzdGF0aW9uSWQiOiJhMWIyYzNkNC1lNWY2LTc4OTAtYWJjZC1lZjEyMzQ1Njc4OTAiLCJzdGF0aW9uTmFtZSI6IkV4YW1wbGUgU29sYXIgSG9tZSIsInN0YXRpb25UeXBlIjoyLCJmcm9tTG9naW4iOnRydWV9
```

Copy the query string after `station_detail?` into `STATION_DETAIL`. That value is base64 JSON, for example:

```text
eyJzdGF0aW9uSWQiOiJhMWIyYzNkNC1lNWY2LTc4OTAtYWJjZC1lZjEyMzQ1Njc4OTAiLCJzdGF0aW9uTmFtZSI6IkV4YW1wbGUgU29sYXIgSG9tZSIsInN0YXRpb25UeXBlIjoyLCJmcm9tTG9naW4iOnRydWV9
```

Decoded shape:

```json
{
  "stationId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "stationName": "Example Solar Home",
  "stationType": 2,
  "fromLogin": true
}
```

(Use your real blob from the portal — the example above is fictional.)

### Temperature / voltage

Plant historical charts (`statisticsAndPreV2`) and live flow (`stations/flow`) expose **power / SOC only** for this station — not temp or voltage.

When `DEVICE_DETAIL` is set, each live poll also calls equipment telemetry using `deviceSn` / `deviceType` from that blob:

`GET …/sems-plant/api/equipments/{deviceSn}/telemetry?deviceType=…&pwId=…`

From that payload:

- **Temperature** (`system` / chamber temp) → PVOutput `v5`
- **Vac** (AC voltage) → PVOutput `v6`

Historical / batch uploads **do not** send temp or voltage (so PVOutput does not store `-1` for those fields). Temp and voltage are live-only.

### `DEVICE_DETAIL` example

In SEMS+, open a device under the station. The URL looks like:

```text
https://au-semsplus.goodwe.com/#/station_monitor/station_detail/device_detail?eyJzdGF0aW9uSWQiOiJhMWIyYzNkNC1lNWY2LTc4OTAtYWJjZC1lZjEyMzQ1Njc4OTAiLCJzdGF0aW9uTmFtZSI6IkV4YW1wbGUgU29sYXIgSG9tZSIsImRldmljZVNuIjoiRVhBTVBMRVNOMTIzNDU2IiwiZGV2aWNlVHlwZSI6IkVORVJHWV9TVE9SQUdFX0lOVEVHUkFURURfQ0FCSU5FVCIsInRpbWVzcGFuIjotOCwic3VidHlwZSI6IlJFU0lERU5USUFMIn0=
```

Copy the query string after `device_detail?` into `DEVICE_DETAIL`. Decoded shape:

```json
{
  "stationId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "stationName": "Example Solar Home",
  "deviceSn": "EXAMPLESN123456",
  "deviceType": "ENERGY_STORAGE_INTEGRATED_CABINET",
  "timespan": -8,
  "subtype": "RESIDENTIAL"
}
```

(Use your real blob from the portal — the example above is fictional.)

## Valid `SERVER` values

Matches the SEMS+ login server dropdown (`config.js` `serverConfig`):

| Login label   | Code | SEMS+ web                        | Default gateway                                                |
| ------------- | ---- | -------------------------------- | -------------------------------------------------------------- |
| China         | `cn` | `https://cn-semsplus.goodwe.com` | login `api`, else `https://cn-gateway.semsportal.com/web/sems` |
| Australia     | `au` | `https://au-semsplus.goodwe.com` | `https://au-gateway.semsportal.com/web/sems`                   |
| International | `hk` | `https://hk-semsplus.goodwe.com` | `https://hk-gateway.semsportal.com/web/sems`                   |
| Europe        | `eu` | `https://eu-semsplus.goodwe.com` | `https://eu-gateway.semsportal.com/web/sems`                   |
| Americas      | `us` | `https://us-semsplus.goodwe.com` | `https://us-gateway.semsportal.com/web/sems`                   |

Accepts the label (`Australia`) or code (`au`).

Login API (same as the browser for Australia):

`POST https://au-semsplus.goodwe.com/web/sems/sems-user/api/v1/auth/cross-login`

([semsplus.goodwe.com/#/login](https://semsplus.goodwe.com/#/login) is the front door; selecting Australia uses the `au-semsplus` host above.)

## Behaviour

1. SEMS+ `cross-login` with `semsPlusWeb` + `X-Signature`
2. Backfill last `BACKFILL_DAYS` via `statisticsAndPreV2` → PVOutput `addbatchstatus` (up to 30 statuses per request; [API docs](https://www.pvoutput.org/help/api_specification.html))
3. Every poll: live `stations/flow` + optional inverter telemetry (temp/voltage) first, then today's historical series → status/batch uploads

Historical points are downsampled to **15 minutes** and batch requests are spaced (~65s) to stay near the free-tier **60 requests/hour** limit. If PVOutput returns `403 Exceeded 60 requests per hour`, the app logs a warning, pauses that upload stream, and continues running — remaining points retry on later polls.

Past calendar days that finish uploading are recorded in `.data/upload-state.json`. On the next start, those days are skipped; only **today** (historical catch-up) and **live** flow are fetched each poll. Incomplete past days may be cached under `.data/pending/` so SEMS is not re-queried.

Uses SEMS+ gateway APIs only (not legacy `www.semsportal.com` monitor APIs).

## Run with systemd (root / system service)

Runs as `User=root`. The unit’s `WorkingDirectory` is **`/root/goodwesemsplus`** — clone/install the app there; if that directory is missing, systemd fails with `Failed at step CHDIR`.

Config comes from **`/root/goodwesemsplus/.env`**. The unit only sets `NODE_ENV=production`; it does not define SEMS/PVOutput secrets.

1. Install Node.js 20+ on the host (see Setup). Confirm `which npm` (default unit expects `/usr/bin/npm`).
2. As root, clone into `/root/goodwesemsplus`, install packages, and configure:

```bash
git clone https://github.com/intelseb/goodwesemsplus.git /root/goodwesemsplus
cd /root/goodwesemsplus
npm install
cp .env.example .env
# fill EMAIL, PASSWORD, STATION_DETAIL, DEVICE_DETAIL, PVOUTPUT_API, SERVER, etc.
npm start   # confirm it runs before enabling systemd
```

3. Install the unit:

```bash
sudo cp /root/goodwesemsplus/deploy/goodwesemsplus.service /etc/systemd/system/goodwesemsplus.service
sudo systemctl daemon-reload
sudo systemctl enable --now goodwesemsplus.service
sudo systemctl status goodwesemsplus.service
```

Useful commands:

| Command                                 | Description                                              |
| --------------------------------------- | -------------------------------------------------------- |
| `sudo systemctl status goodwesemsplus`  | Show whether the service is running and recent log lines |
| `sudo systemctl restart goodwesemsplus` | Restart the poller (e.g. after editing `.env`)           |
| `sudo systemctl stop goodwesemsplus`    | Stop the service                                         |
| `sudo systemctl start goodwesemsplus`   | Start the service                                        |
| `journalctl -u goodwesemsplus -f`       | Follow live logs                                         |
| `journalctl -u goodwesemsplus -n 100`   | Show the last 100 log lines                              |
