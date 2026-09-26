# Homepage template source

The homepage is adapted from [Jon Barron's academic website template](https://github.com/jonbarron/jonbarron.github.io).

- Upstream commit: `25905bd773bd778585e66725780a7bc589269af1`.
- Upstream files: `index.html` and `stylesheet.css`.
- Upstream README permits cloning the code for personal use.

`index.html` reuses the upstream 800px outer table, profile table (63% / 37%), section-heading tables, and publication rows (20% image / 80% text). Ziyi Wang's existing biography, contact links, news, papers, images, reviewer service, and awards replace the template author's content. ICLR 2027 has been added to reviewer service.

`stylesheet.css` is the upstream stylesheet with the yellow `span.highlight` rule removed and `font-display: swap` added so text remains readable while Lato loads. The profile and publication tables retain the upstream side-by-side layout on both desktop and mobile, with the original box sizing, normal line height, and 160px publication previews. There is no mobile breakpoint that stacks table cells. `homepage.css` contains original-photo portrait framing, video previews, and styling for the existing news and service/award lists; only those local lists have mobile-specific adjustments. The portrait is cropped at display time; `images/wzy.png` remains the original photo.

No upstream personal content, example-paper assets, analytics, or custom domain configuration is included.
