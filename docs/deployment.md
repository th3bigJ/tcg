# Deployment

## Secrets: runtime only, not build time

**Do not** put `PAYLOAD_SECRET`, `DATABASE_URI`, or any other secrets in Docker **build** arguments or build-time environment variables. Build args are baked into image layers and can be read by anyone with access to the image.

The app reads these from `process.env` at **runtime** (e.g. in `payload.config.ts`). They only need to be available when the container **starts**, not when the image is built.

### Coolify

1. Open your application in Coolify.
2. Go to the **Environment Variables** (or **Build / General**) section.
3. **Remove** from **Build** (or “Build arguments”):
   - `PAYLOAD_SECRET`
   - `DATABASE_URI`
4. Ensure they are set only as **Runtime** (or **General / Deployment**) environment variables so they are injected when the container runs, not during `docker build`.

You can keep **build-time** variables that are not secret and are required by the build (e.g. `NIXPACKS_NODE_VERSION`, `NEXT_PUBLIC_SERVER_URL` if you need it inlined at build time). Never put secrets there.

### Summary

| Variable                 | Use at build time? | Use at runtime? |
|--------------------------|--------------------|-----------------|
| `PAYLOAD_SECRET`         | No                 | Yes             |
| `DATABASE_URI`           | No                 | Yes             |
| `NEXT_PUBLIC_SERVER_URL` | Optional           | Yes             |
| `NIXPACKS_NODE_VERSION`  | Yes                | No              |
