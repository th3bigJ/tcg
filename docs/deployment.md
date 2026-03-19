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

### Run migrations after deploy

Payload does **not** run migrations automatically when the app starts. After each deploy (or once when you first set up the DB), run migrations against your **runtime** database:

1. In Coolify, open your application.
2. Use **Execute Command** (or a one-off container) with the same image and runtime env (so `DATABASE_URI` and `PAYLOAD_SECRET` are set).
3. Run: `npm run migrate` (or `npx payload migrate`).

If you use a **Release Command**, set it to: `npm run migrate` so migrations run after each deploy. Not all Coolify setups support release commands; if yours doesn’t, run `npm run migrate` manually after deploying.

Until migrations have been run, relationship columns (e.g. `sets.brand_id`, `master_card_list.brand_id`, `master_card_list.set_id`) may be missing, so Brands and Sets will not link in the admin.

### Summary

| Variable                 | Use at build time? | Use at runtime? |
|--------------------------|--------------------|-----------------|
| `PAYLOAD_SECRET`         | No                 | Yes             |
| `DATABASE_URI`           | No                 | Yes             |
| `NEXT_PUBLIC_SERVER_URL` | Optional           | Yes             |
| `NIXPACKS_NODE_VERSION`  | Yes                | No              |
