# Unified Image and Video Creation Documentation

**Goal:** Remove the separate Toho Image Studio project and document image and video creation under THQ Video API.

**Architecture:** The project registry remains the source for cards, navigation, structured data and build outputs. THQ Video API owns eight documentation pages; Cloudflare Pages redirects retired URLs to the matching replacement pages.

**Tech stack:** Rspress 2, MDX, TypeScript, Vitest, Playwright, Cloudflare Pages.

## Scope and verified sources

The user requested removal of the standalone image project, integration of image creation, and replacement of obsolete models and API guides. Continue publication under the website push authorization already given.

- Product implementation: `newapi-flyreq-integration/new-api`, `codex/studio-integration`, `ef94f15`.
- Public model catalog: `https://new.thqllm.com/api/pricing`, checked on 2026-09-29. Includes Seedance 2.0, Seedance 2.5 and MiniMax-H3. Aliases are dated examples, with current account permissions authoritative.
- Provider configuration is per user. Text and images can be manual. Image editing through references is implemented; do not promise mask painting or automatic cross-device project synchronization.
- Cloudflare Pages redirect syntax verified against primary documentation.

## Execution checklist

- [x] Expose three projects through `src/data/projects.ts`, home copy, About and project metadata.
- [x] Replace five retired guide files with eight THQ Video API documents: `index`, `quick-start`, `text-images`, `storyboard`, `projects`, `models`, `video-api`, `faq`.
- [x] Use current aliases in `models.mdx`; put prices and model-specific limits under current catalog authority. Document string `seconds` and the verified `/v1/videos` lifecycle.
- [x] Add `site/public/_redirects` and verify that every destination is a registered document.
- [x] Update navigation/search fixtures to the combined product while retaining focus, history, panel and tab-overflow coverage.
- [x] Run typecheck, checks for changed source, full unit tests. Run build-producing suites sequentially.
- [x] Refresh and inspect affected macOS visual baselines, then run browser tests and static output verification.
- [ ] Push to website `main`; verify Cloudflare, three-project homepage, new guides and retired URL redirects.

## Boundary

This changes the portal and documentation. It does not migrate data or deploy the old image application into New API. Do not submit paid generation requests during documentation verification.
