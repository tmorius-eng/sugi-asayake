/**
 * Хуулийн гурван хуудасны англи, япон хувилбар (2026-09-14).
 *
 * Монголын shared/site-documents.ts-тэй ижил үүрэг: admin-ийн хадгалсан мөр дарж
 * бичдэг FALLBACK. /admin -> Баримт бичиг одоо хэл солих товчтой (Монгол / English /
 * 日本語), хэл бүрд нэг site_documents мөр хадгална; мөргүй хэл доорх текстийг зурна.
 *
 * Эдгээр нь 2026-09-14-ний байдлаарх монгол fallback-ийн орчуулга — судалсан текст,
 * иш татсан хууль, тоо бүр хэвээр, юу ч нэмээгүй. Үг бүрийн хуудасны орчуулагчаар
 * (shared/i18n.ts) явахгүй: нууцлалын бодлого бол баримт, баримт хэл бүрд зохиогддог,
 * толь бичгээс угсрагддаггүй. Tom /admin-д монгол үгээ засахад англи, япон хуудас
 * түүнийг ч засах хүртэл хэлснээ хэлсээр — хуулийн мэдэгдэлд үнэнч зан төлөв.
 */
import type { SiteDocumentKey } from "./site-documents";

export type SiteDocumentTranslation = {
  title: string;
  lead: string;
  /** [heading, paragraph] pairs, one per section of the Mongolian original. */
  sections: readonly (readonly [string, string])[];
};

export const siteDocumentTranslations: Record<SiteDocumentKey, { en: SiteDocumentTranslation; ja: SiteDocumentTranslation }> = {
  privacy: {
    en: {
      title: "Privacy policy",
      lead: "This policy is drawn up under Mongolia's Law on the Protection of Personal Data (revised edition, in force since 1 May 2022) and applies to everything you do on the SUGI ASAYAKE Mongolia online store: browsing, registering and ordering.",
      sections: [
        ["The information we collect", "When you register: your phone number (required, confirmed by SMS through the verify.mn service) and your name (optional). When you order: a delivery address and a contact phone number. Optionally, on your profile: skin and hair type, beauty interests and similar settings used for recommendations. When you write a review: your name, rating and the text of the review (these are shown publicly on the product page). While you use the site we also collect technical information such as IP address and pages visited, automatically, in anonymised and aggregated form (see §3 below). We never store or even see payment card details (card numbers and the like)."],
        ["Purposes and legal basis", "We use your information: (a) to perform the order and delivery contract; (b) with your consent, to confirm your phone number and send order notifications; (c) to keep the records that accounting and tax law require; (d) on the basis of our legitimate interest in keeping the site secure, preventing fraud and improving performance. We do not use it for anything else — in particular we do not sell or rent it for targeted advertising."],
        ["Cookies and storage on your device", "Our site uses only three first-party cookies that its own operation needs: a session cookie that remembers you are signed in, a cookie that remembers a guest's cart, and an anonymised cookie for visitor statistics (for example, conversion-rate calculations). All three are httpOnly, travel only over HTTPS (secure) and are not sent along to third-party sites (SameSite=Lax). We use NO THIRD-PARTY ADVERTISING cookies such as Google Analytics or the Meta (Facebook) Pixel. Your shop grid size, recently viewed products and light/dark preference are kept only in your browser's own storage (localStorage) and are never sent to the server. The statistics cookie is used only with your consent — the prompt shown on your first visit lets you choose \"Accept all\" or only what is necessary, and you can change that decision at any time later through the \"Cookie settings\" button at the bottom of the page or the cookie icon in the bottom-left corner."],
        ["Sharing with third parties", "We share your information only with the service providers we genuinely need in order to operate: verify.mn (your phone number, solely to confirm it), Brevo (to send order confirmation emails), Cloudflare (to store product images; holds no personal data), Oracle Cloud (reliable hosting of the database, Tokyo) and, once enabled, QPay (payment processing). Beyond these, we do not sell or transfer your information to anyone without your consent."],
        ["Transfers abroad", "Under Article 8 of the Law, transferring your information abroad requires your express consent or another legal basis. Some of the services named in §4 (for example Brevo) use international servers, so when you take an action that uses those services (placing an order, registering) you are treated as having consented to that transfer."],
        ["Retention period", "Financial records relating to orders and payments are kept for at least 10 years under Article 11 of the Accounting Law — even if you delete your account, they remain for that period. Other information (for example profile settings) is deleted once the purpose it was collected for is fulfilled, or when you delete your account."],
        ["Your rights", "Under Article 16 of the Law you have the right: (a) to know what information about you is collected and used, and to receive a copy of it on paper or electronically; (b) to have inaccurate information corrected; (c) to have your information deleted as the law provides; (d) to withdraw consent you have given at any time (Article 8.7); (e) to lodge a complaint if you believe your rights have been infringed. Send these requests to 9450-9911 or asayake0307@gmail.com; we act on them once your identity is confirmed."],
        ["Deleting your data (including Facebook sign-in users)", "You can have your account and all personal data linked to it deleted at any time: (1) sign in and go to Account → Security → \"Delete account\", confirming with your password — your name, phone, email, addresses, wishlist, reviews and Facebook link are removed immediately; or (2) call 9450-9911 or email asayake0307@gmail.com with the phone number registered to the account — we complete the request within 7 days and confirm back to you. If you signed in with Facebook, we receive only your app-scoped Facebook user ID, name, profile picture and email (where available); removing \"sugiasayake\" under Facebook → Settings → Apps and Websites ends the connection to Facebook, and whatever remains on our side is deleted through the steps above. Only the financial records of orders and payments are kept, in anonymised form, for the period the law requires (see \"Retention period\" above)."],
        ["Users under the age of majority", "We do not collect personal data from anyone below the age of full legal capacity set out in Articles 16–19 of the Civil Code without a guardian's consent. If we find that a minor's data was collected inadvertently, we delete it promptly."],
        ["Security of your data", "We apply the technical and organisational measures the Cybersecurity Law calls for: passwords are stored as irreversible hashes, administrative access is limited by role, and payment card details are never stored at all. In the event of a serious security breach we notify the affected users and the competent authority promptly, as the law requires."],
        ["Complaints and the supervisory authority", "We recommend contacting us directly on 9450-9911 first so the matter can be resolved. If it is not, you have the right to bring a complaint about personal data to the National Human Rights Commission (nhrcm.gov.mn), a consumer complaint to the Agency for Fair Competition and Consumer Protection, or a claim before the competent court."],
        ["Changes to this policy", "We may update this policy at any time to reflect changes in law or in how we operate; an update takes effect as soon as it is published on the site. When a change is material, the \"last updated\" date at the top is revised."],
      ],
    },
    ja: {
      title: "プライバシーポリシー",
      lead: "本ポリシーは、モンゴル国「個人情報保護法」（改正版、2022年5月1日施行）に基づいて作成されたもので、SUGI ASAYAKE Mongoliaオンラインストアの閲覧、会員登録、ご注文を含むすべてのご利用に適用されます。",
      sections: [
        ["収集する情報", "会員登録時：電話番号（必須。verify.mnサービスを通じてSMSで確認します）およびお名前（任意）。ご注文時：お届け先住所と連絡先電話番号。プロフィールで任意に：肌質・髪質、美容の関心事など、おすすめの提案に使用する設定。レビュー投稿時：お名前、評価、レビュー本文（商品ページに公開されます）。また、サイト利用中にIPアドレスや閲覧ページなどの技術情報を、匿名化・集計した形で自動的に収集します（下記§3参照）。クレジットカードの詳細（カード番号など）を当社が保存したり閲覧したりすることは一切ありません。"],
        ["利用目的と法的根拠", "お客様の情報は次の目的で利用します。(a) ご注文および配送に関する契約の履行、(b) お客様の同意に基づく電話番号の確認と注文通知の送信、(c) 会計・税務法令で義務付けられた記録の保持、(d) サイトの安全確保、不正防止、性能改善という正当な利益。これ以外の目的、たとえばターゲティング広告のための販売・貸与には使用しません。"],
        ["Cookieと端末内の保存", "当サイトは、運営に必要なファーストパーティCookieを3種類のみ使用します。ログイン状態を記憶するセッションCookie、ゲストのカートを記憶するCookie、訪問者統計（コンバージョン率の算出など）のための匿名化Cookieです。いずれもhttpOnlyで、HTTPS経由でのみ送信され（secure）、第三者サイトには送られません（SameSite=Lax）。Google AnalyticsやMeta（Facebook）Pixelなど、第三者の広告用Cookieは一切使用しません。ショップの表示サイズ、最近見た商品、ライト／ダークモードの設定は、お使いのブラウザの保存領域（localStorage）にのみ保存され、サーバーには送信されません。統計用Cookieはお客様の同意がある場合にのみ使用します。初回訪問時に表示される画面で「すべて許可」または必要なもののみを選択でき、その後もページ下部の「Cookie設定」ボタン、または左下のCookieアイコンからいつでも変更できます。"],
        ["第三者への提供", "お客様の情報は、サービスの提供に実際に必要な次の事業者にのみ提供します。verify.mn（電話番号の確認のみを目的として電話番号を送信）、Brevo（注文確認メールの送信）、Cloudflare（商品画像の保存。個人情報は含みません）、Oracle Cloud（データベースの安全な保管、東京）、および有効化された場合のQPay（決済処理）。これら以外の者に、お客様の同意なく情報を販売・移転することはありません。"],
        ["国外への移転", "法第8条により、お客様の情報を国外に移転するには、明示的な同意またはその他の法的根拠が必要です。§4に挙げた一部のサービス（例：Brevo）は国際的なサーバーを利用しているため、これらのサービスを利用する行為（ご注文、会員登録など）を行った時点で、この移転に同意したものとみなされます。"],
        ["保存期間", "ご注文および支払いに関する財務記録は、会計法第11条に基づき最低10年間保存します。アカウントを削除された場合も、この期間中は保存されます。その他の情報（プロフィール設定など）は、収集目的が達成された時点、またはアカウント削除時に削除します。"],
        ["お客様の権利", "法第16条に基づき、お客様には次の権利があります。(a) どの情報が収集・利用されているかを知り、その写しを書面または電子的に受け取る権利、(b) 誤った情報を訂正させる権利、(c) 法律の定めに従い情報を削除させる権利、(d) 与えた同意をいつでも撤回する権利（第8.7条）、(e) 権利が侵害されたと考える場合に苦情を申し立てる権利。これらのご請求は 9450-9911 または asayake0307@gmail.com までお送りください。ご本人確認のうえ対応します。"],
        ["データの削除（Facebookでログインした方も含む）", "アカウントおよびそれに関連するすべての個人情報は、いつでも削除を求めることができます。(1) サイトにログインし、アカウント → セキュリティ → 「アカウントを削除」を押してパスワードで確認すると、お名前、電話番号、メール、住所、お気に入り、レビュー、Facebook連携が直ちに削除されます。(2) または 9450-9911 に電話するか、asayake0307@gmail.com に登録済みの電話番号を添えてご依頼ください。7日以内に処理し、結果をご連絡します。Facebookでログインした場合、当社が受け取るのはアプリ用のFacebookユーザーID、お名前、プロフィール写真、メール（ある場合）のみです。Facebook → 設定 → アプリとウェブサイト から「sugiasayake」を削除するとFacebookとの連携は終了し、当社側に残る情報は上記の方法で削除されます。ご注文・支払いの財務記録のみが、法定期間（上記「保存期間」）の間、匿名化した形で保存されます。"],
        ["未成年のお客様", "民法第16〜19条に定める完全な行為能力に達していない方からは、保護者の同意なく個人情報を収集しません。未成年者の情報を誤って収集したことが判明した場合は、速やかに削除します。"],
        ["情報の安全性", "パスワードを復元不可能なハッシュ形式で保存する、管理者のアクセスを権限レベルで制限する、クレジットカード情報を一切保存しないなど、サイバーセキュリティ法に沿った技術的・組織的な対策を講じています。重大なセキュリティ侵害が発生した場合は、法律に従い、影響を受けるお客様および所管当局に速やかに通知します。"],
        ["苦情の申し立てと監督機関", "まずは 9450-9911 に直接ご連絡いただき、解決を図ることをお勧めします。解決しない場合、個人情報に関する苦情は国家人権委員会（nhrcm.gov.mn）へ、消費者としての苦情は公正競争・消費者保護庁へ、または管轄の裁判所へ申し立てる権利があります。"],
        ["ポリシーの変更", "法令や運営上の変更に合わせて、本ポリシーを随時更新することがあります。更新はサイトに掲載された時点で効力を生じます。重要な変更があった場合は、ページ上部の最終更新日を更新します。"],
      ],
    },
  },
  terms: {
    en: {
      title: "Terms of service",
      lead: "These terms govern ordering and purchasing goods through the SUGI ASAYAKE Mongolia online store and are drawn up in accordance with the laws of Mongolia.",
      sections: [
        ["General", "By using the website or placing an order you accept these terms in full. They are based on the Civil Code of Mongolia, the Law on Consumer Protection and other applicable legislation."],
        ["Your rights as a consumer", "Under the Law on Consumer Protection you have the right to receive goods that are of proper quality and safe, to receive accurate information about them, to demand repair, replacement, a price reduction or a refund for goods that are defective or fail the properties advertised, and to go to court if those demands are not met."],
        ["Our obligations", "We ensure that the goods we sell meet the applicable standards and are safe, and we show accurate information about origin, ingredients, use, storage conditions and warranty period on the product page. We aim to resolve complaints and defect reports within a reasonable time of receiving them."],
        ["Orders and the contract", "Your order is your offer; the sale contract comes into force when we confirm the order (by sending a confirmation, or by accepting cash on delivery). Where stock has run out or a system error has produced a wrong price, we may cancel the order and refund the full amount paid, and we will tell you immediately."],
        ["Prices and payment", "All prices on the website are in Mongolian tögrög (₮) and include VAT. Payment can be made in cash when you receive the order or, once enabled, through the QPay system. We do not hold online payment details (card or account numbers) ourselves — they are processed through a certified third-party payment provider."],
        ["Delivery and receipt", "Within Ulaanbaatar we aim to deliver within roughly 24–48 hours for the fee stated at the time of ordering; you can also collect from any of our stores. We recommend checking for damage or shortages at the moment of receipt and reporting them on 9450-9911 on the next working day at the latest."],
        ["Returns, exchanges and warranty", "Full return and exchange conditions are on the Returns and exchanges page. Unless the manufacturer states otherwise, the quality and safety warranty under the Civil Code runs for at least 6 months from receipt (for seasonal goods, from the start of that season). Hygiene products whose seal or packaging has been opened are limited in what can be returned or exchanged, for reasons of infection control."],
        ["Protection of personal data", "We collect and use your personal data under the Law on the Protection of Personal Data only to fulfil orders, arrange delivery and resolve service matters — it is never sold or passed to third parties without your consent. See the Privacy policy page for details."],
        ["Phone number verification (verify.mn)", "When you register or reset your password we offer to confirm your phone number by SMS through Mongolia's verify.mn service. Each verification SMS costs 150₮, charged to your number by your mobile operator (Mobicom, Unitel, Skytel, G-Mobile and others) — SUGI ASAYAKE Mongolia receives none of it. Your phone number is passed to verify.mn solely for this verification and is not used for any other purpose (such as advertising). Verification is always optional and is not required to register or to order."],
        ["Intellectual property", "The logos, trademarks, images, text, design and other content on the website belong to SUGI ASAYAKE Mongolia and its rights holders and are protected by the Copyright Law. Copying, altering or distributing them for commercial purposes without our written permission is prohibited."],
        ["Equal treatment", "In line with Article 14 of the Constitution of Mongolia we serve every customer equally and with respect, regardless of ethnic origin, language, race, age, sex, social origin, wealth, religion, opinion or education."],
        ["Limitation of liability", "Without limiting your rights under the Law on Consumer Protection and other mandatory provisions, our liability for indirect or incidental loss arising from use of the website is limited to the maximum extent the law allows. We are not liable for delays caused by force majeure such as natural disasters or transport disruption."],
        ["Disputes, governing law and changes", "We aim to resolve any dispute first by mutual agreement on 9450-9911; if no agreement is reached you may apply to the Agency for Fair Competition and Consumer Protection or to the competent court of Mongolia. These terms are governed by the laws of Mongolia. We may update them at any time; an update takes effect as soon as it is published on the website, and continued use means you accept the new terms."],
      ],
    },
    ja: {
      title: "利用規約",
      lead: "本規約は、SUGI ASAYAKE Mongoliaのオンラインストアを通じた商品のご注文・ご購入に適用されるもので、モンゴル国の法令に従って作成されています。",
      sections: [
        ["総則", "ウェブサイトのご利用またはご注文をもって、本規約に全面的に同意したものとみなします。本規約はモンゴル国民法、消費者保護法およびその他の関連法令に基づいています。"],
        ["お客様の権利", "消費者保護法に基づき、お客様には、品質が確かで安全な商品を受け取る権利、商品について正確な情報を得る権利、欠陥がある商品や表示された性質を満たさない商品について修理・交換・値引き・返金を求める権利、そしてその要求が満たされない場合に裁判所に訴える権利があります。"],
        ["当社の義務", "当社は、販売する商品が基準を満たし安全であることを保証し、原産地、成分、使用方法、保管条件、保証期間に関する正確な情報を商品ページに表示します。苦情や不良のご連絡を受けた後は、適切な期間内に解決するよう努めます。"],
        ["ご注文と契約", "お客様のご注文は申込み（オファー）であり、当社が注文を確定した時点（確認通知の送信、または現金でのお受け取り時）で売買契約が成立します。在庫切れやシステムエラーによる誤った価格表示などの場合、当社は注文を取り消し、お支払い済みの金額を全額返金する権利を有し、その旨を直ちにお知らせします。"],
        ["価格と支払い", "ウェブサイト上のすべての価格はモンゴル・トゥグルグ（₮）建てで、付加価値税を含みます。お支払いは商品お受け取り時の現金、または有効化された場合はQPayシステムで行えます。オンライン決済の詳細情報（カード番号・口座番号）を当社が保存することはなく、認定された第三者の決済事業者を通じて処理されます。"],
        ["配送とお受け取り", "ウランバートル市内では、ご注文時に表示された手数料で、おおむね24〜48時間以内の配達を目指します。当社の店舗でのお受け取りも可能です。配送中の破損や不足は、お受け取り時にご確認のうえ、遅くとも翌営業日までに 9450-9911 へご連絡いただくことをお勧めします。"],
        ["返品・交換・保証", "返品・交換の詳細な条件は「返品と交換」ページをご覧ください。製造者が特に定めていない限り、民法に基づく品質・安全性の保証はお受け取りから最低6か月間（季節商品はその季節の開始から）有効です。衛生シールや包装が開封された衛生用品は、衛生上の理由から返品・交換が制限されます。"],
        ["個人情報の保護", "お客様の個人情報は、個人情報保護法に基づき、ご注文の履行、配送の手配、サービス上の問題解決の目的にのみ収集・利用し、お客様の同意なく第三者に販売・提供することはありません。詳しくはプライバシーポリシーのページをご覧ください。"],
        ["電話番号の確認（verify.mn）", "会員登録時およびパスワード再設定時に、モンゴルのverify.mnサービスを通じてSMSで電話番号を確認するオプションを提供しています。確認SMSの送信ごとに150₮が、お客様の通信事業者（Mobicom、Unitel、Skytel、G-Mobileなど）からお客様の番号に課金されます。この金額をSUGI ASAYAKE Mongoliaが受け取ることはありません。電話番号はこの確認のためにのみverify.mnに送信され、広告などその他の目的には使用しません。この確認は常に任意であり、ご注文や会員登録に必須ではありません。"],
        ["知的財産", "ウェブサイト上のロゴ、商標、画像、文章、デザインなどのコンテンツはSUGI ASAYAKE Mongoliaおよび権利者の財産であり、著作権法により保護されています。当社の書面による許可なく、商業目的で複製・改変・配布することを禁じます。"],
        ["平等な扱い", "モンゴル国憲法第14条に基づき、当社は民族、言語、人種、年齢、性別、社会的出自、財産、宗教、思想、学歴にかかわらず、すべてのお客様に平等かつ敬意をもって対応します。"],
        ["責任の制限", "消費者保護法その他の強行法規に定められたお客様の権利を制限することなく、ウェブサイトの利用に起因する間接的・付随的な損害について、当社は法律が認める最大限の範囲で責任を制限します。自然災害や輸送の混乱などの不可抗力による遅延について、当社は責任を負いません。"],
        ["紛争、準拠法、変更", "紛争はまず 9450-9911 を通じて相互理解に基づき解決するよう努めます。合意に至らない場合は、公正競争・消費者保護庁またはモンゴル国の管轄裁判所に申し立てることができます。本規約にはモンゴル国の法律が適用されます。当社は本規約を随時更新する権利を有し、更新はウェブサイトに掲載された時点で効力を生じます。継続してご利用いただくことで、新しい規約に同意したものとみなします。"],
      ],
    },
  },
  returns: {
    en: {
      title: "Returns and exchanges",
      lead: "We fully respect the right to return or exchange defective goods that the Law on Consumer Protection gives you — but for reasons of hygiene and safety, goods that have already been used or opened and are not defective cannot be returned.",
      sections: [
        ["General principle", "For goods that are defective or fail the properties advertised, SUGI ASAYAKE Mongolia fully honours the rights to replacement, repair and refund granted by the Law on Consumer Protection. In addition, to protect hygiene and prevent false returns, we apply the policy set out below — it never limits your statutory rights and applies only where the item is not defective and you simply did not like it."],
        ["Defective goods or goods below the required quality", "If you receive an item different from your order or with damage or defects that were not disclosed in advance, we exchange it for an undamaged item of the same kind immediately at your request, or within a mutually agreed time if that is not possible. Under the Civil Code, unless the manufacturer states otherwise, the quality and safety warranty runs for at least 6 months from receipt (for seasonal goods, from the start of that season); for a hidden defect that appears in that period through no fault of yours, you choose between repair, replacement and a full or partial refund."],
        ["Used, opened, non-defective goods cannot be returned", "Mongolian law grants a right of return or exchange only for defective goods — there is no legal right to return a NON-DEFECTIVE item that has been used, opened or whose seal or packaging has been broken because you \"did not like it\" or \"changed your mind\". SUGI ASAYAKE Mongolia therefore states clearly that it does not accept returns or exchanges in such cases. This is our company's actual policy, and we recommend reading it before ordering."],
        ["Hygiene and beauty products", "Hygiene and beauty products whose sanitary seal or protective packaging has been opened (for example skincare products, sanitary items, oral care) cannot be returned or exchanged under any circumstances, for reasons of infection control — including where the item seems defective (that is first checked with photo or video evidence as described in §5)."],
        ["How to make a request", "Under the Law on Consumer Protection you raise your complaint or claim with us first, and we will not refuse it without grounds. As soon as possible after receiving the goods, contact 9450-9911 or asayake0307@gmail.com with your order number, photos or video showing the defect, and the condition of the packaging."],
        ["Assessment and decision", "Our team assesses the request on the evidence provided and the actual condition of the item and offers a suitable remedy (repair, exchange or refund). Where clearly false information is found (for example claiming an item \"arrived damaged\" after using it), we may lawfully refuse the request."],
        ["Refunds", "An approved refund is made as quickly as possible by the method you paid with (bank transfer, or QPay once it is enabled). Order and payment records are kept for at least 10 years under the Accounting Law (see the Privacy policy page for details)."],
        ["Damage in transit", "If a delivered item shows external damage, check it at the moment of receipt and report it on 9450-9911 on the next working day at the latest — this is not covered by the \"used goods\" limitation in §3, because the damage occurred in transit and not through your fault."],
        ["If a complaint is not resolved", "If we cannot reach a mutual understanding, you have the right to apply to the Agency for Fair Competition and Consumer Protection or to the competent court of Mongolia."],
      ],
    },
    ja: {
      title: "返品と交換",
      lead: "消費者保護法に定められた、欠陥商品の返品・交換の権利を当社は全面的に尊重します。ただし、衛生と安全の観点から、すでに使用・開封された欠陥のない商品は返品できません。",
      sections: [
        ["基本原則", "SUGI ASAYAKE Mongoliaは、欠陥がある商品や表示された性質を満たさない商品について、消費者保護法が認める交換・修理・返金の権利を全面的に履行します。加えて当社は、衛生の確保と不正な返品の防止のため、以下の方針を定めています。この方針が法律で認められた権利を制限することは一切なく、商品に欠陥がなく単に気に入らなかった場合にのみ適用されます。"],
        ["欠陥商品・品質基準を満たさない商品", "ご注文と異なる商品、または事前に告知されていない破損・欠陥のある商品を受け取られた場合、お客様のご要望に応じて直ちに、それが難しい場合は相互に合意した期間内に、同種の欠陥のない商品と交換します。民法に基づき、製造者が特に定めていない限り、品質・安全性の保証はお受け取りから最低6か月間（季節商品はその季節の開始から）有効で、この期間中にお客様の過失によらず現れた隠れた欠陥については、修理・交換・全額または一部返金のいずれかをお客様が選択できます。"],
        ["使用済み・開封済みで欠陥のない商品は返品できません", "モンゴル国の法令は欠陥商品についてのみ返品・交換の権利を認めており、「気に入らない」「気が変わった」という理由で、使用済み・開封済み、あるいはシールや包装が破れた欠陥のない商品を返品する法的権利はありません。したがってSUGI ASAYAKE Mongoliaは、このような場合には返品・交換を行わないことを明確にお知らせします。これは当社の実際の方針であり、ご注文前にお読みいただくことをお勧めします。"],
        ["衛生用品・美容製品", "衛生シールや保護包装が開封された衛生用品・美容製品（スキンケア製品、衛生用品、オーラルケアなど）は、衛生上の理由からいかなる場合も返品・交換できません。欠陥があるように見える場合も同様です（その場合はまず§5に従い写真・動画による証拠で確認します）。"],
        ["申請の手順", "消費者保護法に基づき、苦情やご要望はまず当社にお申し出いただくものとし、当社は正当な理由なくこれを拒否しません。商品お受け取り後できるだけ早く、9450-9911 または asayake0307@gmail.com にご連絡のうえ、注文番号、欠陥を示す写真・動画、包装の状態をお送りください。"],
        ["確認と決定", "当社の担当チームが、提出された証拠と商品の実際の状態に基づいてご要望を確認し、可能な解決策（修理、交換、返金）をご提案します。明らかに虚偽の申告（使用後に「破損して届いた」と申し出るなど）が判明した場合、当社は法律に基づきご要望を拒否する権利を有します。"],
        ["返金", "承認された返金は、お支払いいただいた方法（銀行振込、またはQPayが有効化されている場合はQPay）で、できる限り速やかに行います。ご注文・支払いの記録は、会計法に基づき最低10年間保存します（詳しくはプライバシーポリシーのページをご覧ください）。"],
        ["配送中の破損", "配送された商品に外観上の破損がある場合は、お受け取り時にご確認のうえ、遅くとも翌営業日までに 9450-9911 へご連絡ください。これは§3の「使用済み商品」の制限には該当しません。破損はお客様の過失ではなく配送中に生じたものだからです。"],
        ["苦情が解決しない場合", "当社との相互理解に至らなかった場合、お客様は公正競争・消費者保護庁またはモンゴル国の管轄裁判所に申し立てる権利があります。"],
      ],
    },
  },
  about: {
    en: {
      title: "About us",
      lead: "Asayake LLC supplies Japanese beauty, health and household products to Mongolia under official distribution rights.",
      sections: [
        ["Who we are", "Since it was founded in 2013, Asayake LLC has sold the products of many Japanese companies in Mongolia under official distribution rights. Besides our own stores we supply chain retailers, and Japanese quality products now reach more than 200 chain store branches. That lets us serve customers closer to where they live."],
        ["Our own brands", "Alongside well-known Japanese brands, we worked with a Japanese cosmetics manufacturer to produce two complete own-brand beauty ranges for the Mongolian market. Both have been rated highly by customers and have built a loyal following."],
        ["SUGI ASAYAKE stores", "Four SUGI ASAYAKE stores operate in Ulaanbaatar, importing skincare, cosmetics, health, hygiene, household and food products from Japan through official channels. Addresses and opening hours for each branch are on the Stores section of this site."],
        ["The online store", "This online store lets you order our products from home. You can have them delivered or collect them from the branch nearest you, and you can check the ingredients, net content, country of origin and shelf life of every item on its product page."],
        ["Quality and authenticity", "All of our goods arrive from Japan through official channels. Every product carries the Japanese manufacturer's barcode (JAN code), which you can use to verify that it is genuine. Each product page shows the barcode, ingredients, net content and country of origin openly."],
        ["Contact us", "Phone: 9450-9911. Email: asayake0307@gmail.com. For frequently asked questions and details on delivery and returns, see the Help page. Thank you to every customer who chooses us."],
      ],
    },
    ja: {
      title: "会社案内",
      lead: "アサヤケ有限会社は、日本の化粧品・健康・日用品を正規の販売権のもとでモンゴルに供給しています。",
      sections: [
        ["会社について", "アサヤケ有限会社は2013年の設立以来、多くの日本企業の商品を正規の権利のもとでモンゴルで販売してきました。自社店舗に加えてチェーン店にも商品を供給しており、現在200を超えるチェーン店舗で日本品質の商品をお求めいただけます。これによりお客様により近い場所でのサービスが可能になりました。"],
        ["自社ブランド商品", "日本の有名ブランドに加え、当社は日本の化粧品メーカーと協力して自社ブランドの化粧品シリーズを2種類製造し、モンゴルで販売してきました。いずれもお客様から高い評価をいただき、多くのリピーターを得ています。"],
        ["SUGI ASAYAKE 店舗", "ウランバートル市内で SUGI ASAYAKE の4店舗を運営し、スキンケア・化粧品・健康・衛生・日用品・食品を日本から正規ルートで輸入しています。各店舗の住所と営業時間は本サイトの「店舗」からご覧ください。"],
        ["オンラインストア", "このオンラインストアでは、ご自宅から商品をご注文いただけます。配送またはお近くの店舗での受け取りをお選びいただけ、各商品ページで成分・内容量・原産国・使用期限をご確認いただけます。"],
        ["品質と正規品保証", "当社の商品はすべて日本から正規ルートで入荷しています。各商品には日本のメーカーのバーコード（JANコード）が付いており、そのコードで正規品であることをご確認いただけます。商品ページにはバーコード・成分・内容量・原産国を明記しています。"],
        ["お問い合わせ", "電話: 9450-9911　メール: asayake0307@gmail.com　よくあるご質問、配送・返品の詳細はヘルプページをご覧ください。ご利用いただいているお客様に心より感謝申し上げます。"],
      ],
    },
  },
  careers: {
    en: {
      title: "Careers",
      lead: "If you would like to work at SUGI ASAYAKE, please get in touch.",
      sections: [
        ["Open positions", "There are no open positions advertised at the moment. New openings are posted on this page, so it is worth checking back from time to time."],
        ["Who we hire", "We recruit for roles such as store consultant, cashier, warehouse staff, online order operator and delivery driver. We look for people who are interested in beauty and skincare products, who deal with customers courteously, and who work well in a team."],
        ["What we offer", "A formal employment contract, social insurance, a staff discount, training on the Japanese products we carry, and a regular working schedule."],
        ["How to apply", "Send your application and CV to asayake0307@gmail.com, or call 9450-9911 for more information. Please put the position you are interested in in the subject line."],
        ["How we handle your data", "Applications and CVs we receive are used only for recruitment and are deleted once the selection process is complete. See the Privacy policy page for details."],
      ],
    },
    ja: {
      title: "採用情報",
      lead: "SUGI ASAYAKE で働くことにご関心のある方は、ぜひご連絡ください。",
      sections: [
        ["募集中の職種", "現在、募集中の職種はございません。新しい募集はこのページに掲載しますので、ときどきご確認ください。"],
        ["どのような方を求めているか", "店舗コンサルタント、レジ担当、倉庫スタッフ、オンライン注文オペレーター、配送ドライバーなどの職種で採用を行っています。化粧品やスキンケア商品に関心があり、お客様に丁寧に対応でき、チームで働ける方を求めています。"],
        ["待遇", "正式な雇用契約、社会保険、従業員割引、取り扱う日本商品に関する研修、規則的な勤務シフト。"],
        ["応募方法", "応募書類と履歴書を asayake0307@gmail.com までお送りいただくか、9450-9911 までお電話ください。件名にご希望の職種をご記入ください。"],
        ["個人情報の取り扱い", "お預かりした応募書類・履歴書は採用目的にのみ使用し、選考終了後に削除します。詳しくはプライバシーポリシーのページをご覧ください。"],
      ],
    },
  },
};
