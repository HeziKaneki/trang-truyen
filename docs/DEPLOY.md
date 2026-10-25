# Déploiement / Triển khai một VPS

## Chuẩn bị

Ubuntu 24.04 LTS, tối thiểu 2 CPU / 4 GB RAM, khuyến nghị 4 CPU / 8 GB khi build tại VPS. Trỏ DNS A/AAAA của tên miền đến VPS. Mở TCP 80/443, UDP 443 nếu dùng HTTP/3 và SSH theo cấu hình của bạn. Không mở PostgreSQL/Redis ra Internet.

Cài Docker Engine + Compose plugin từ tài liệu chính thức: https://docs.docker.com/engine/install/ubuntu/. Kiểm tra `docker version` và `docker compose version`. Sao chép repository vào một thư mục của tài khoản vận hành; không chạy ứng dụng bằng tài khoản cá nhân dùng chung. Cấp quyền ghi thư mục `backups` cho container backup nếu host có hạn chế.

## `.env`

```sh
cp .env.example .env
chmod 600 .env
```

Điền tất cả biến không có giá trị:

- `APP_URL=https://truyen.example.com`, `SITE_ADDRESS=truyen.example.com`. Caddy tự lấy và gia hạn HTTPS. Không đặt dấu `/` cuối APP_URL.
- `AUTH_SECRET`: ít nhất 32 ký tự ngẫu nhiên. Có thể tạo bằng `openssl rand -hex 32`.
- `POSTGRES_PASSWORD`: mật khẩu ngẫu nhiên. Dùng hex để tránh ký tự cần URL-encode; đồng bộ trong DATABASE_URL nếu chạy Node ngoài Compose. Compose tự thay hostname postgres/redis.
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` (ít nhất 12 ký tự). Seed chỉ tạo khi chưa tồn tại, không reset mật khẩu mỗi lần restart. Đổi mật khẩu từ UI khi cần.
- `SEED_DEMO=false` cho site thật; nếu muốn dữ liệu mẫu chọn true và `SEED_PASSWORD` ngẫu nhiên ≥12 ký tự. Không dùng tài khoản mẫu để vận hành thật.
- SMTP thật: host, port 587 với SMTP_SECURE=false (STARTTLS) hoặc 465 với true; username/password/from theo nhà cung cấp. Cấu hình SPF/DKIM/DMARC ở DNS theo nhà cung cấp email.
- Google tùy chọn: OAuth client loại web application, authorized redirect URI chính xác `https://truyen.example.com/api/auth/callback/google`. Không bật `allowDangerousEmailAccountLinking`.
- `UPLOAD_DIR=/app/uploads` được Compose đặt tự động; `LOG_LEVEL=info`; SENTRY_DSN tùy chọn.

Không commit `.env`, không đưa secret vào Dockerfile/build args hay lệnh shell chia sẻ công khai.

## Lần chạy đầu

```sh
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 web worker caddy
```

Web chạy `prisma migrate deploy`, seed idempotent rồi Next standalone. Worker chỉ khởi động sau healthcheck web. Đăng nhập bằng admin trong `.env`; truy cập `/quan-tri` để cấu hình website. Kiểm tra `/api/health` trả `{"status":"ok"}`. Thử đăng ký bằng email bạn kiểm soát và kiểm tra thư xác minh. Chứng chỉ cần DNS đúng, cổng 80/443 truy cập được và server có kết nối Internet.

Môi trường local qua toàn bộ Compose:

```sh
# APP_URL=http://localhost, SITE_ADDRESS=:80
docker compose -f compose.yaml -f compose.dev.yaml --profile dev up -d --build
```

Mailpit UI chỉ bind loopback:8025; port DB/Redis của override cũng chỉ loopback. Không dùng override dev trên VPS public.

## Cập nhật và quay lại

1. Tạo backup trước cập nhật.
2. Lấy source mới, đọc migration và thay đổi `.env.example`.
3. `docker compose build` rồi `docker compose up -d`.
4. Kiểm tra health, đăng nhập, đọc chương, đăng chương mới và log worker.
5. Khi rollback, schema phải tương thích bản ứng dụng cũ; nếu không, phục hồi database và source đồng bộ. Không chạy migration down tự động.

## Backup

Container backup chạy `scripts/backup.sh` lúc 02:00 UTC hằng ngày: pg_dump custom format, ghi file tạm rồi rename, mode 600, giữ 7 ngày. Có thể chạy ngay:

```sh
docker compose exec backup sh /backup.sh
ls -lh backups
```

Mật khẩu được truyền qua environment bên trong container, không phải tham số CLI. Sao chép bản backup đã mã hóa đến máy khác. Volume trên cùng VPS không chống được mất toàn bộ ổ đĩa.

Sao lưu upload, tạm dừng các mutation trong cửa sổ backup nếu cần snapshot nhất quán:

```sh
docker run --rm -v trang-truyen_uploads:/data:ro -v "$PWD/backups:/backup" alpine sh -c 'tar czf /backup/uploads-$(date -u +%Y%m%d).tgz -C /data .'
```

Tên volume theo project `name: trang-truyen`; nếu thay project name phải đổi tương ứng. Caddy data chứa chứng chỉ và khóa, nên sao lưu riêng với quyền hạn chế.

## Phục hồi

Thử restore định kỳ trên một máy thử nghiệm trước khi cần thực sự phục hồi.

```sh
docker compose stop web worker
docker compose exec -T postgres sh -c 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < backups/novel-YYYYMMDD-HHMMSS.dump
docker run --rm -v trang-truyen_uploads:/data -v "$PWD/backups:/backup:ro" alpine sh -c 'tar xzf /backup/uploads-YYYYMMDD.tgz -C /data'
docker compose up -d web worker
```

Phục hồi Redis AOF cùng mốc dữ liệu nếu có thể; không tái sử dụng các batch counter chưa xử lý từ database đã rollback mà không kiểm tra ledger. Queue lịch xuất bản có reconciler từ DB. Nếu xóa Redis để khởi tạo lại, mất rate-limit/dedupe ngắn hạn và queue email đang chờ; không mất truyện hay notification đã lưu trong DB. Chỉ thực hiện trong cửa sổ bảo trì đã lên kế hoạch.

## Chẩn đoán

- Web unhealthy: xem log migration, kiểm tra POSTGRES_PASSWORD, SMTP/env validation, disk. Không bỏ qua migration lỗi bằng `db push`.
- Không nhận thư: kiểm tra log worker, SMTP_FROM và credentials, cổng egress; dùng Mailpit trong dev. Queue retry exponential, giữ 500 job lỗi để kiểm tra.
- Chương hẹn giờ chưa xuất bản: worker heartbeat, status REVIEW/hidden, giờ UTC, banned words. Reconciler mỗi phút.
- 403 CSRF: APP_URL phải bằng origin trên trình duyệt; dùng HTTPS đúng tên miền. Không sửa bảo vệ Origin để chữa lỗi reverse proxy.
- 429 khi local: tất cả truy cập không proxy có identity local, chờ cửa sổ rate limit. Production Caddy cung cấp X-Real-IP tin cậy.
- Upload lỗi: JPG/PNG/WebP, ≤6MB, dimensions ≤10.000 mỗi cạnh và ≤36 triệu pixel; container node cần sở hữu volume uploads.
- Dung lượng tăng: ảnh chưa dùng chưa có garbage collection tự động; kiểm tra UploadedFile và tham chiếu trước khi dọn. Không xóa ảnh còn được nhúng trong chương/phiên bản.
- Windows lỗi symlink: build local tự dùng output chuẩn; Linux Docker vẫn standalone. Docker Compose phải dùng Linux containers.
- Chế độ build không cần DB trực tuyến; runtime bắt buộc `.env` hợp lệ và DB/Redis.

Caddy image chuẩn dùng gzip/zstd. Brotli cần custom module và không có trong cấu hình này. Google/SMTP production, TLS và khôi phục backup phải được kiểm chứng trên hạ tầng triển khai thực.
