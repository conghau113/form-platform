# Hướng dẫn sử dụng — Form Platform

Runbook vận hành: cài đặt, chạy dev, kiểm thử, và self-host bằng Docker Compose.
Bổ sung cho `README.md` (kiến trúc/versioning) và `AGENTS.md` (quy ước cho agent).

> Cập nhật theo Phase 1A–1D của track production-hardening
> (`docs/expansion/production-hardening.md`). DB đã chuyển **SQLite → PostgreSQL**;
> API có validate env (fail-fast), CORS allowlist, helmet, rate-limit, và `GET /health`.

---

## 0. Yêu cầu môi trường

| Công cụ | Phiên bản | Ghi chú |
|---|---|---|
| Node | `>= 20` | có `.nvmrc` = 20 → `nvm use` |
| pnpm | `>= 9` | repo pin `pnpm@9.0.0` |
| Docker Desktop | bản mới | cần cho Postgres + 1 test DB (Testcontainers) + self-host |

```bash
node -v        # phải >= 20
pnpm -v        # phải >= 9
docker info    # Docker Desktop phải đang chạy
```

---

## 1. Cài đặt lần đầu

```bash
pnpm install
```

Tạo file env (gitignored) từ mẫu:

```bash
cp apps/api/env.example     apps/api/.env
cp apps/builder/env.example apps/builder/.env
```

> ⚠️ **Quan trọng:** trong `apps/api/.env`, `DATABASE_URL` **phải là Postgres**
> (repo đã bỏ SQLite từ Phase 1B). Nếu còn dòng cũ `file:../.data/workspace.db`,
> sửa thành (cổng `5435` khớp Postgres trong `docker-compose.yml`):
>
> ```
> DATABASE_URL="postgresql://formplatform:formplatform@localhost:5435/formplatform?schema=public"
> ```

---

## 2. Chạy ở chế độ phát triển (dev)

API cần một Postgres đang chạy. Cách gọn nhất: chỉ bật service Postgres bằng Docker,
còn app chạy bằng `pnpm dev`.

```bash
# (a) Bật riêng Postgres (chạy nền), cổng host 5435
docker compose up -d postgres

# (b) Áp migration vào DB (lần đầu, hoặc khi có migration mới)
pnpm --filter @app/api exec prisma migrate deploy

# (c) Chạy toàn bộ app (turbo: api :3001 + builder Vite :5173 + watch các package)
pnpm dev
```

| Thành phần | URL |
|---|---|
| Builder (UI) | http://localhost:5173 |
| API | http://localhost:3001 |
| Health check | http://localhost:3001/health → `{"status":"ok","db":"up"}` |

Dừng Postgres khi xong:

```bash
docker compose stop postgres
```

> ⚠️ Đừng chạy đồng thời `pnpm dev` **và** `docker compose up` (full stack) — cả hai
> đều bind cổng `3001`. Chọn một trong hai.

---

## 3. Kiểm thử & chất lượng mã (chạy trước khi commit)

```bash
pnpm typecheck                      # turbo typecheck toàn repo
pnpm test                           # toàn bộ test (cần Docker cho 1 test DB)
pnpm --filter @app/api test         # chỉ test backend (121 test)

# Biome: KHÔNG chạy --write toàn repo (baseline chưa sạch). Chỉ kiểm file đang sửa:
pnpm biome check apps/api/src/<file-bạn-sửa>.ts
```

Khi đụng `packages/*` (không cần cho `apps/*`):

```bash
pnpm changeset                      # ghi version bump + changelog
```

---

## 4. Self-host bằng Docker Compose (toàn bộ stack)

Build & chạy Postgres + API + Builder trong container:

```bash
docker compose up --build
```

| Service | Cổng host | URL / Kết nối |
|---|---|---|
| builder (nginx + SPA) | `8080` | http://localhost:8080 |
| api (NestJS) | `3001` | http://localhost:3001 |
| postgres | `5435` | DataGrip → `localhost:5435` |

- API tự chạy `prisma migrate deploy` khi khởi động (auto-migrate).
- Healthcheck của api dùng `GET /health` (xanh = process **và** DB đều ổn).

Lệnh quản lý:

```bash
docker compose up -d --build      # chạy nền
docker compose logs -f api        # xem log api
docker compose ps                 # trạng thái + health
docker compose down               # dừng + xóa container
docker compose down -v            # ... và XÓA luôn dữ liệu DB (volume pgdata)
```

Tùy biến qua file `.env` ở **gốc repo** (compose đọc `${VAR:-default}`):

```
POSTGRES_PORT=5435
API_PORT=3001
BUILDER_PORT=8080
CORS_ORIGINS=http://localhost:8080
VITE_API_BASE=http://localhost:3001
```

---

## 5. Biến môi trường API (validate fail-fast khi boot)

Khi khởi động, API validate env bằng Zod — thiếu/sai biến bắt buộc là **dừng ngay**
(không chạy lỗi giữa chừng).

| Biến | Bắt buộc | Mặc định | Ý nghĩa |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | chuỗi kết nối Postgres |
| `PORT` | | `3001` | cổng HTTP |
| `CORS_ORIGINS` | | `http://localhost:5173` | allowlist origin (phẩy ngăn cách); rỗng = chặn cross-origin |
| `THROTTLE_TTL` | | `60000` | cửa sổ rate-limit (ms) |
| `THROTTLE_LIMIT` | | `120` | số request/IP trong cửa sổ |
| `AI_*` | | — | cấu hình AI (BYOK, tùy chọn) — xem `apps/api/env.example` |

> Lưu ý bảo mật: `x-owner-id` và `?roles=` hiện là **operator-declared**, CHƯA phải
> ranh giới bảo mật (auth thật ở Phase 2).

---

## 6. Các tác vụ Database thường dùng

```bash
# Tạo migration mới sau khi sửa schema.prisma (cần Postgres đang chạy)
pnpm --filter @app/api exec prisma migrate dev --name <ten_migration>

# Áp migration đã có (production / CI)
pnpm --filter @app/api exec prisma migrate deploy

# Sinh lại Prisma Client
pnpm --filter @app/api exec prisma generate
```

> ⚠️ `prisma generate` sẽ **EPERM (khóa DLL)** nếu server api đang chạy giữ DLL → tắt
> tiến trình nghe cổng 3001 trước khi generate.

---

## 7. Tham chiếu nhanh — cổng & lệnh

| Mục đích | Lệnh |
|---|---|
| Cài đặt | `pnpm install` |
| Dev (api+builder) | `docker compose up -d postgres` → `pnpm dev` |
| Build toàn repo | `pnpm build` |
| Typecheck | `pnpm typecheck` |
| Test | `pnpm test` |
| Self-host | `docker compose up --build` |
| Dừng self-host | `docker compose down` (`-v` để xóa DB) |

| Cổng | Dùng cho |
|---|---|
| `5173` | Builder (Vite dev) |
| `8080` | Builder (nginx, trong Docker) |
| `3001` | API |
| `5435` | Postgres (host → container) |
