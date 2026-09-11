import { withPayload } from '@payloadcms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'kongstocks.com' },
      { protocol: 'https', hostname: 'staging.kongstocks.com' },
      { protocol: 'http', hostname: 'kongstocks.com' },
    ],
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
