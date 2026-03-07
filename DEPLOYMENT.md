# Attendance Internet Deployment

## Goal

Expose the attendance server over the public internet so the web app and the desktop client work outside the office Wi-Fi.

## Recommended Setup

1. Run the server on a dedicated Windows PC or VPS that stays online.
2. Put HTTPS in front of the Node server with a reverse proxy or secure tunnel.
3. Point the desktop client and browser users to the same public URL.

## 1. Configure `client-config.json`

Update the root config before building or starting the app:

```json
{
  "publicUrl": "https://attendance.yourdomain.com/",
  "remoteUrls": [
    "https://attendance.yourdomain.com/"
  ],
  "server": {
    "bindHost": "0.0.0.0",
    "port": 3000,
    "lanHost": "",
    "trustProxy": true,
    "secureCookies": true
  }
}
```

Notes:

- `publicUrl` is the main internet address shown in the app.
- `remoteUrls` is what the desktop client tries first.
- `trustProxy: true` is needed when HTTPS is terminated by a proxy or tunnel.
- `secureCookies: true` should stay enabled for public HTTPS deployments.

## 2. Start The Server

For a direct Node deployment:

```powershell
npm run server:node
```

For the packaged desktop/server build:

```powershell
npm run dist:server
```

## 3. Publish Through HTTPS

Use one of these patterns:

- Reverse proxy on a VPS or cloud VM
- Secure tunnel from the office/server machine to a public HTTPS URL

The proxy or tunnel should forward incoming HTTPS traffic to:

```text
http://127.0.0.1:3000
```

## 4. Update Client Builds

After `client-config.json` is updated, rebuild the client installer:

```powershell
npm run dist:client
```

The desktop client will then prefer the public URL, with local fallbacks kept for on-site use.

## 5. Verification

Check these after deployment:

1. `https://attendance.yourdomain.com/api/server-info` returns JSON.
2. Login works from mobile data, not just office Wi-Fi.
3. Cookies are marked secure in the browser when using HTTPS.
4. The desktop client opens the public URL without needing private IPs.
