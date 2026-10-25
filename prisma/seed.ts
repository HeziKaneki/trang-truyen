import 'dotenv/config';
import { createHash } from 'node:crypto';
import { hash, argon2id } from 'argon2';
import { PrismaClient } from '@prisma/client';
import { env, validateEnv } from '../src/lib/env';
import { slugify } from '../src/lib/utils';
import { content } from '../src/server/sanitize';
const db = new PrismaClient();
const categories = ['Lãng mạn', 'Kỳ ảo', 'Đời thường', 'Trinh thám', 'Thanh xuân', 'Phiêu lưu'];
const tags = [
  'chữa lành',
  'trưởng thành',
  'gia đình',
  'tình bạn',
  'bí ẩn',
  'thành phố',
  'hành trình',
  'phép thuật',
];
const names = [
  'An Nhiên',
  'Minh Khuê',
  'Hạ Lam',
  'Trúc Linh',
  'Khánh An',
  'Phong Vũ',
  'Hải Đăng',
  'Mộc Miên',
  'Ngọc Hà',
  'Thiên Thanh',
  'Bảo Nam',
  'Thu Uyên',
  'Quỳnh Chi',
  'Đông Quân',
  'Mai Anh',
  'Tùng Lâm',
  'Nguyên Phương',
  'Vân Khánh',
  'Diệu Linh',
  'Hoàng Minh',
];
const titles = [
  'Mùa hạ ở cuối con đường',
  'Người giữ những vì sao',
  'Tiệm sách bên hiên mưa',
  'Bức thư không người gửi',
  'Ngày chúng ta còn trẻ',
  'Qua miền gió thổi',
  'Hẹn gặp dưới tán bằng lăng',
  'Thành phố của những giấc mơ',
  'Một chén trà cùng bà',
  'Dấu chân trên sân ga',
  'Năm ấy hoa phượng nở',
  'Phía bên kia ngọn đồi',
  'Những ngày xanh trở lại',
  'Khu rừng biết nói',
  'Căn bếp của mẹ',
  'Vụ án chiếc đồng hồ cũ',
  'Chúng mình của tháng năm',
  'Bản đồ không có tên',
  'Chạm vào một mùa thương',
  'Ngọn hải đăng cuối trời',
  'Con hẻm nhỏ bình yên',
  'Bí mật ở tầng gác mái',
  'Lá thư gửi tuổi hai mươi',
  'Chuyến tàu lúc bình minh',
  'Còn một người đợi em',
  'Vương quốc sau cánh cửa',
  'Ngày mai trời lại sáng',
  'Vị khách lúc nửa đêm',
  'Khoảng trời của chúng ta',
  'Nơi những dòng sông gặp nhau',
];
const chapterTitles = ['Một cuộc trở về', 'Điều còn để ngỏ', 'Khi cánh cửa mở ra'];
const openings = [
  'Buổi chiều hôm ấy, mưa đến sớm hơn thường lệ. Những giọt nước gõ đều lên mái hiên, khiến con phố vốn náo nhiệt bỗng chậm lại. Tôi đứng trước cánh cổng cũ, tay giữ chặt chiếc túi đã theo mình qua rất nhiều chuyến xe.',
  'Ánh sáng cuối ngày trải thành một vệt dài trên mặt bàn. Cuốn sổ nằm đó, mở đúng trang có nét chữ nghiêng quen thuộc. Đã nhiều năm trôi qua, nhưng chỉ cần nhìn thấy một dòng, tôi vẫn nhận ra người từng viết nó.',
  'Không ai trong xóm nhớ chính xác cửa tiệm mở từ khi nào. Người ta chỉ biết mỗi sáng, trước tiếng chuông đầu tiên của trường học, một ngọn đèn nhỏ đã sáng phía sau lớp kính phủ hơi sương.',
];
async function main() {
  validateEnv();
  const admin = await db.user.upsert({
    where: { email: env.ADMIN_EMAIL.toLowerCase() },
    create: {
      email: env.ADMIN_EMAIL.toLowerCase(),
      username: 'admin',
      name: 'Quản trị viên',
      role: 'ADMIN',
      emailVerified: new Date(),
      birthDate: new Date('1990-01-01'),
      passwordHash: await hash(env.ADMIN_PASSWORD, { type: argon2id }),
    },
    update: {},
  });
  const cats = [];
  for (const name of categories)
    cats.push(
      await db.category.upsert({
        where: { slug: slugify(name) },
        create: { name, slug: slugify(name) },
        update: {},
      }),
    );
  const labels = [];
  for (const name of tags)
    labels.push(
      await db.tag.upsert({
        where: { slug: slugify(name) },
        create: { name, slug: slugify(name) },
        update: {},
      }),
    );
  if (
    env.SEED_DEMO !== 'true' ||
    (await db.siteSetting.findUnique({ where: { key: 'demoSeeded' } }))
  ) {
    console.log('Admin and categories ready. Demo seed unchanged.');
    return;
  }
  if (!env.SEED_PASSWORD || env.SEED_PASSWORD.length < 12)
    throw new Error('SEED_PASSWORD must have at least 12 characters when SEED_DEMO=true');
  const passwordHash = await hash(env.SEED_PASSWORD, { type: argon2id });
  const authors = [];
  for (let i = 0; i < names.length; i++)
    authors.push(
      await db.user.upsert({
        where: { username: `tacgia${i + 1}` },
        create: {
          username: `tacgia${i + 1}`,
          email: `tacgia${i + 1}@example.com`,
          name: names[i],
          passwordHash,
          emailVerified: new Date(),
          birthDate: new Date('1995-06-15'),
          bio: `Mình là ${names[i]}. Viết để giữ lại những điều đẹp đẽ trong đời thường. Rất vui khi gặp bạn ở một trang sách.`,
          role: i === 19 ? 'MODERATOR' : 'USER',
        },
        update: {},
      }),
    );
  for (let i = 0; i < titles.length; i++) {
    const author = authors[i % authors.length];
    const name = names[(i + 3) % names.length];
    const slug = slugify(titles[i]);
    const category = cats[i % cats.length];
    const story = await db.story.upsert({
      where: { slug },
      create: {
        authorId: author.id,
        categoryId: category.id,
        title: titles[i],
        slug,
        description: `${name} trở về nơi từng gọi là nhà, mang theo một lời hứa chưa kịp thực hiện. Giữa những cuộc gặp tưởng chừng tình cờ, một bí mật cũ dần hé lộ. “${titles[i]}” là câu chuyện về lòng can đảm bắt đầu lại, về những người ở bên ta khi mọi lối đi tưởng như đã khép.`,
        status: i % 4 === 0 ? 'COMPLETED' : 'ONGOING',
        published: true,
      },
      update: {},
    });
    for (const tag of [labels[i % labels.length], labels[(i + 2) % labels.length]])
      await db.storyTag.upsert({
        where: { storyId_tagId: { storyId: story.id, tagId: tag.id } },
        create: { storyId: story.id, tagId: tag.id },
        update: {},
      });
    let total = 0;
    for (let n = 1; n <= 3; n++) {
      const html = `<p>${openings[(i + n) % openings.length]}</p><p>${name} khẽ gọi tên tôi. Giọng nói ấy không khác trong ký ức, chỉ có khoảng im lặng sau câu chào là dài hơn. Chúng tôi ngồi xuống bậc thềm, nhìn những chiếc lá trôi trên vũng nước. Không ai vội nhắc về chuyện cũ.</p><h2>${chapterTitles[n - 1]}</h2><p>“Cậu vẫn còn giữ nó sao?” Tôi hỏi, chỉ vào chiếc hộp gỗ đặt bên cạnh. ${name} gật đầu. Bên trong là những tấm vé tàu, một bức ảnh đã phai màu và mảnh giấy ghi địa chỉ ở phía bên kia thành phố. Mỗi món đồ giống một câu hỏi mà chúng tôi từng bỏ quên.</p><p>Tôi đã nghĩ cuộc trở về sẽ đơn giản: thu dọn vài thứ, ký những tờ giấy cần thiết rồi đi. Nhưng khi chạm tay lên mặt hộp, tôi hiểu rằng có những việc không thể giải quyết bằng cách quay lưng. Có người đã chờ một lời giải thích suốt từng ấy năm.</p><blockquote>Đôi khi, điều khó nhất không phải tìm đường về, mà là tin rằng vẫn còn một nơi dành cho mình.</blockquote><p>Chúng tôi quyết định sẽ đến địa chỉ ấy vào sáng hôm sau. ${name} lấy một tờ bản đồ cũ, đánh dấu quãng đường qua cây cầu và khu chợ ven sông. Tôi nhận ra nét chữ trên mảnh giấy giống nét chữ trong cuốn sổ của bà, dù ngày tháng được ghi lại trước khi tôi ra đời rất lâu.</p><p>Khi trời tối, ánh đèn từ những căn nhà bên kia đường lần lượt sáng lên. Tiếng bát đũa, tiếng gọi nhau về ăn cơm và mùi lá bưởi từ sân sau khiến tôi thấy lòng nhẹ đi một chút. Chưa có câu trả lời nào xuất hiện, nhưng lần đầu tiên sau nhiều tháng, tôi không còn muốn chạy trốn.</p><p>Đêm đó, tôi ghi vào trang ${i * 3 + n} của cuốn sổ: “${titles[i]} — ${chapterTitles[n - 1]}”. Bên dưới, tôi để trống một dòng. Có lẽ ngày mai, một câu chuyện khác sẽ bắt đầu từ chính khoảng trắng ấy.</p>`;
      const data = content(html);
      total += data.wordCount;
      const chapter = await db.chapter.upsert({
        where: { storyId_number: { storyId: story.id, number: n } },
        create: {
          storyId: story.id,
          number: n,
          title: chapterTitles[n - 1],
          ...data,
          status: 'PUBLISHED',
          publishedAt: new Date(Date.now() - (30 - i) * 86400_000 + n * 3600_000),
        },
        update: {},
      });
      const commentId = `c${createHash('sha256').update(`seed-comment-${i}-${n}`).digest('hex').slice(0, 24)}`;
      await db.comment.upsert({
        where: { id: commentId },
        create: {
          id: commentId,
          chapterId: chapter.id,
          userId: authors[(i + n) % authors.length].id,
          body: [
            'Đọc đến đoạn cuối thấy lòng dịu lại. Cảm ơn tác giả vì câu chuyện này.',
            'Mình rất thích cách tả khung cảnh. Mong được đọc tiếp hành trình của nhân vật.',
            'Chi tiết chiếc hộp gỗ làm mình tò mò quá. Hẹn gặp ở chương sau nhé!',
          ][n - 1],
        },
        update: {},
      });
    }
    await db.story.update({ where: { id: story.id }, data: { wordCount: total } });
    if (i < 6)
      await db.featuredStory.upsert({
        where: { storyId: story.id },
        create: { storyId: story.id, position: i },
        update: {},
      });
  }
  await db.siteSetting.upsert({
    where: { key: 'demoSeeded' },
    create: { key: 'demoSeeded', value: 'true' },
    update: {},
  });
  console.log(
    `Seeded 20 sample users, 30 stories, 90 chapters and comments. Admin account ID: ${admin.id}`,
  );
}
main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Seed failed');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
