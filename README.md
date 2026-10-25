# Trang Truyện

Nền tảng đọc và xuất bản truyện tiếng Việt, được xây dựng theo [PROMPT.md](PROMPT.md). Next.js App Router, TypeScript strict, PostgreSQL 16, Redis 7 và BullMQ. Mọi dữ liệu ứng dụng được lưu trong PostgreSQL; seed là dữ liệu mẫu tùy chọn, không phải dữ liệu giả trong giao diện.

## Khởi động phát triển

Cần Node.js **22.18+**, pnpm 10 và Docker Compose v2. Trên Windows dùng Docker Desktop với Linux containers; nếu PowerShell chặn `pnpm.ps1`, dùng `pnpm.cmd`.

```sh
corepack enable
pnpm install
pnpm dev:all
```

`dev:all` là lệnh khởi động duy nhất sau khi cài dependencies: tạo `.env` với bí mật ngẫu nhiên nếu chưa tồn tại, khởi động PostgreSQL/Redis/Mailpit, migrate, seed, rồi chạy web và worker. Web: http://localhost:3000. Hộp thư thử nghiệm: http://localhost:8025.

Tài khoản quản trị lấy từ **ADMIN_EMAIL / ADMIN_PASSWORD trong `.env`**. Không có mật khẩu cố định trong source. Khi `SEED_DEMO=true`, seed tạo 20 tài khoản `tacgia1@example.com` đến `tacgia20@example.com`, dùng `SEED_PASSWORD`; tài khoản thứ 20 là moderator. Có 30 truyện, 90 chương và bình luận tiếng Việt. Số lượt đọc/vote bắt đầu từ 0. Seed không ghi đè nội dung đã chỉnh sửa và chỉ nạp bộ truyện mẫu một lần.

## Chức năng

- Email/password Argon2id, Google OAuth tùy cấu hình, xác minh email, quên mật khẩu, khóa đăng nhập khi thử quá nhiều.
- Hồ sơ, theo dõi tác giả, cài đặt ngôn ngữ/giao diện, kiểm soát nội dung 18+, quản lý và xóa tài khoản.
- Truyện, chương, upload ảnh được mã hóa lại, TipTap, tự lưu và khôi phục bản nháp trên thiết bị, phát hiện xung đột phiên bản, lịch sử 30 bản, hẹn xuất bản, kéo thả thứ tự, thùng rác 30 ngày.
- Trình đọc với kiểu chữ, cỡ chữ, độ rộng, giãn dòng và ba màu nền; lưu tiến độ; thư viện và danh sách đọc.
- Vote truyện/chương, bình luận và trả lời, ghim/xóa bởi tác giả, báo cáo, thông báo SSE + polling, email tổng hợp.
- Tìm kiếm tiếng Việt có/không dấu với full-text và trigram; lọc, xếp hạng theo kỳ, truyện liên quan, thống kê tác giả.
- Hàng đợi kiểm duyệt, kiểm tra nội dung trước xuất bản, nhật ký, quản lý tài khoản/thể loại/thẻ/từ cấm/truyện nổi bật/cài đặt website.
- Metadata, canonical, JSON-LD, sitemap, robots, RSS truyện/tác giả; giao diện đáp ứng sáng/tối, tiếng Việt và tiếng Anh.

## Lệnh

| Lệnh | Tác dụng |
| --- | --- |
| `pnpm dev:all` | Khởi động toàn bộ môi trường phát triển |
| `pnpm dev` | Web phát triển; cần DB/Redis đang chạy |
| `pnpm worker` | Worker BullMQ riêng |
| `pnpm build` / `pnpm start` | Build production / chạy web |
| `pnpm db:migrate` | Áp dụng migrations đã lưu trong repo |
| `pnpm db:seed` | Tạo admin, danh mục và dữ liệu mẫu tùy cấu hình |
| `pnpm typecheck` / `pnpm lint` | Kiểm tra kiểu / lint |
| `pnpm test` | Unit tests, không cần dịch vụ ngoài |
| `pnpm test:integration` | Integration tests với PostgreSQL/Redis thật |
| `pnpm test:e2e` | Playwright; cần DB/Redis, worker và Mailpit |
| `pnpm format` | Định dạng source |

Các bài integration chỉ chấp nhận `DATABASE_URL` có tên database chứa `_test`. Sao chép `.env` thành `.env.test`, đổi database thành `novel_test` và Redis sang database 15, tạo database rồi chạy migration với URL kiểm thử. Không trỏ bộ kiểm thử vào database production. Playwright tạo tài khoản/truyện với hậu tố thời gian trong môi trường phát triển, kiểm tra email qua Mailpit thật và dùng tài khoản admin trong `.env` để kiểm duyệt. Cài trình duyệt bằng `pnpm exec playwright install chromium`.

## Triển khai

Điền `.env` theo `.env.example`, sau đó trên Linux:

```sh
docker compose up -d --build
```

Caddy cung cấp HTTPS, web tự migrate/seed khi khởi động, worker đợi web khỏe, backup chạy mỗi đêm. Xem [hướng dẫn VPS](docs/DEPLOY.md). Build Linux dùng Next standalone; build Windows dùng `next start` để không đòi quyền tạo symlink.

## Cấu trúc

```text
src/app/          Trang SSR, API Route Handlers, metadata và RSS
src/components/   UI, shadcn Button, TipTap, trình đọc và biểu mẫu
src/lib/          i18n tập trung, env, API client, tiện ích
src/server/       Auth, phân quyền, DB/Redis, services, jobs
prisma/           Schema, migrations SQL, seed
docker/           Dockerfile và Caddy
scripts/          Khởi động local và backup
tests/            Unit, integration, Playwright
docs/             Kiến trúc, API, giả định, triển khai, kiểm chứng
```

Đọc [ARCHITECTURE](docs/ARCHITECTURE.md), [API](docs/API.md), [ASSUMPTIONS](docs/ASSUMPTIONS.md) và [VALIDATION](docs/VALIDATION.md) để biết phạm vi kiểm chứng và các giới hạn cụ thể.
