/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The WinUI layer is a single large CSS string assembled from
  // `src/winui/*.css.ts`; nothing here needs transformation, but the app is
  // pinned to the App Router and kept free of experimental flags so the
  // coursework build stays reproducible.
  experimental: {},
};

export default nextConfig;
