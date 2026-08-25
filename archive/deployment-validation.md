# Interactive storefront deployment validation

## 2026-08-13 production propagation check

The interactive storefront checkpoint `8ba72e0d` completed successfully. An immediate live-browser smoke check of `https://sugi-mongo-detasex2.manus.space/` still served the previous `assets/index-BnunJ6tk.js` bundle and did not include the new **SUMMER CARE** carousel markup. This indicated a deployment-propagation delay rather than a local build or TypeScript failure: the final local validation passed 24 unit tests and a production build.

After the deployment propagated, a cache-busted production check confirmed the homepage exposes the **ASAYAKE SUMMER / 2026** carousel with previous/next and slide-tab controls. The published `/shop` route also exposes search, category filtering, in-stock filtering, and sort options, while retaining a clean “catalogue is being prepared” empty state until real products are published. The release is therefore production-verified.

## Quick View and local history release check

For checkpoint `e9fc91bf`, an initial cache-busted check of `/shop` confirms the deployed catalog shell, discovery panel, search, filters, and sorting controls render normally with no published products. The lower recent-history section did not appear in the first page extraction, so the public bundle and DOM are being checked before this release is closed.

After a propagation wait and a second cache-busted check, the public catalog still returned `assets/index-CHR5s1HN.js` and the DOM did not contain `.recently-viewed-section`. This was a deployment-propagation observation; the local release built successfully with 26 passing tests.

On the final cache-busted recheck, the public catalog loaded the updated bundle and rendered the **ТАНЫ СҮҮЛД ҮЗСЭН** section with its privacy explanation and first-time visitor message. The published catalog is therefore verified. Quick View card interaction will become observable as soon as the owner publishes at least one real product, without creating fictitious customer-facing products for QA.

## Content & Media release check

For checkpoint `6aea314b`, a cache-busted production homepage check confirmed the branded hero fallback and seasonal carousel controls render correctly. The deployed protected `/admin?adminSection=media` route settled to the expected sign-in screen for an unauthenticated browser session, confirming that administration remains gated rather than exposing media management publicly. The authenticated Admin Content & Media workspace was also validated in the development session at desktop and mobile sizes, and the protected upload-to-public-override-to-reset integration test passed with cleanup.
