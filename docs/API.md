# API

API nghiệp vụ ở `/api/v1`. Thành công: `{ "data": ... }`. Lỗi: `{ "error": { "code": "FORBIDDEN", "fields": {} } }`; `fields` chỉ xuất hiện cho lỗi Zod. HTTP 401 chưa đăng nhập, 403 không đủ quyền/xác minh/CSRF, 404 không tìm thấy hoặc không được đọc, 409 xung đột, 422 validation, 429 rate limit, 500 lỗi nội bộ.

Mutation phải có cookie phiên (trừ public auth/takedown), Origin đúng APP_URL, cookie `novel-csrf` và header `X-CSRF-Token`. Lấy token bằng `GET /api/csrf`. JSON Content-Type mặc định; uploads dùng multipart FormData. Không gửi secret của server tới client.

| Method / resource | Input | Result / quyền |
| --- | --- | --- |
| GET `/api/auth/*` / POST `/api/auth/*` | Giao thức Auth.js | Credentials/Google/session/signout; CSRF riêng của Auth.js |
| GET `/api/csrf` | — | `{token}`, cookie HttpOnly, no-store |
| GET `/api/health` | — | DB+Redis `status:ok`, 503 khi lỗi |
| POST `register` | email, password≥12, name, username `[a-z0-9_]{3,30}`, birthDate, terms=true | gửi verify; public |
| POST `forgot`, `resend-verification` | email | `{sent:true}` dù không có tài khoản |
| POST `verify` | token 64 hex | tiêu thụ verify/change-email token |
| POST `reset` | token, password≥12 | đổi password, tăng sessionVersion |
| POST `account` | action=profile + name,bio,image?,birthDate? | hồ sơ chính mình |
| POST `account` | action=preferences + language,theme,allowMature,emailDigest | tùy chọn |
| POST `account` | action=password + currentPassword,password | đổi mật khẩu |
| POST `account` | action=email + currentPassword,email | gửi thư xác minh tới email mới |
| POST `account` | action=delete + confirmation=DELETE,currentPassword? | xóa/ẩn danh hóa tài khoản |
| POST `account` | action=reader + settings{fontSize,lineHeight,width,font,theme} | tùy chọn đọc |
| POST `account` | action=notification + type,enabled | CHAPTER/REPLY/FOLLOW/MILESTONE/MODERATION |
| GET `categories` | — | danh mục |
| GET `search?q=` | q≤100 | stories,authors,tags gợi ý |
| POST `stories` | title,description,categoryId,language,status,mature,copyright,cover?,tags[] | tạo, trả story |
| GET/PATCH `stories/:id` | PATCH như tạo | chỉ tác giả |
| POST `stories/:id/chapters` | title | tạo chương nháp |
| POST `stories/:id/reorder` | ids[] đầy đủ, không trùng | đổi thứ tự nguyên tử |
| POST `stories/:id/lifecycle` | action=delete/restore/unpublish | soft-delete 30 ngày |
| GET/PATCH `chapters/:id` | PATCH: title,html,revision | autosave; trả revision mới, 409 khi stale |
| POST `chapters/:id/publication` | status=DRAFT/PUBLISHED/SCHEDULED,publishAt? | publish/kiểm duyệt/hẹn giờ |
| GET `chapters/:id/versions` | — | tối đa 30 bản, chỉ tác giả |
| POST `chapters/:id/versions/:versionId` | {} | restore thành phiên bản mới, draft |
| POST `chapters/:id/lifecycle` | action=delete/restore/unpublish | chỉ tác giả |
| POST `uploads` | FormData file JPG/PNG/WebP ≤6MB | file record, URL + thumbnail; re-encode WebP |
| POST `reads/:chapterId` | {} | deduped Redis counter; guest được phép |
| POST `progress` | chapterId,position∈[0,1] | upsert theo user/story |
| POST `story-votes/:id`, `chapter-votes/:id` | enabled | trạng thái cuối + count |
| POST `follows/:userId` | enabled | không tự follow |
| GET `followers/:userId?direction=following` | direction optional | tối đa 100 public profiles |
| POST `library/:storyId` | enabled | lưu/bỏ lưu |
| POST `lists` | action=create,name | danh sách thuộc user |
| POST `lists` | action=rename,id,name hoặc delete,id | xác minh ownership |
| POST `lists` | action=item,id,storyId,enabled | thêm/bỏ truyện |
| GET `comments/:chapterId?cursor=` | cursor optional | items[20],nextCursor; reply lồng |
| POST `comments/:chapterId` | body≤3000,parentId? | bình luận/reply |
| PATCH `comments/:commentId` | action=edit,body / delete / pin,pinned | owner sửa/xóa; tác giả ghim/xóa |
| GET `notifications` | — | items[100],unread |
| POST `notifications` | id hoặc all=true | đánh dấu đã đọc của chính user |
| GET `/api/notifications/stream` | cookie session | SSE refresh, heartbeat, reconnect |
| GET `analytics` | — | daily 30 ngày, top chapters, tổng truyện của tác giả |
| POST `reports` | targetType,targetId,reason,note | user đã verify |
| POST `takedown` | tương tự, reason=COPYRIGHT,contactEmail | public |
| GET `moderation` | — | reports/audit, moderator/admin |
| POST `moderation` | reportId?,targetType,targetId,action,note,days? | HIDE/REMOVE/RESTORE/WARN/SUSPEND/BAN/UNBAN/APPROVE/DISMISS |
| POST `admin` | action=role,userId,role | admin; không tự hạ quyền |
| POST `admin` | action=category/tag,id?,name | tạo/đổi tên |
| POST `admin` | action=delete-category/delete-tag,id | category phải rỗng |
| POST `admin` | action=merge-tags,sourceId,targetId | gộp relation không trùng |
| POST `admin` | action=banned-word,word,enabled | normalize từ khóa |
| POST `admin` | action=featured,storyId,enabled,position | biên tập homepage |
| POST `admin` | action=setting,key,value | siteName/announcement/registrationOpen |

Các field ID đều CUID; boolean là JSON boolean, không phải chuỗi. API không cho người gửi tự chỉ định authorId/role khi đăng ký. HTML được sanitize server. Giới hạn body JSON 600.000 ký tự, proxy 8MB.

Trang công khai `/kham-pha` nhận `q,category,tag,status,language,mature,minWords,maxWords,updated(1/7/30),sort(trending/newest/reads/votes/updated),page`. RSS: `/rss/truyen/:slug`, `/rss/tac-gia/:username`; chỉ nội dung an toàn cho khách. Ảnh `/uploads/:random.webp`; Caddy phục vụ trực tiếp trong production.
