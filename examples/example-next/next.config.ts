import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  transpilePackages: [
    '@oak/core',
    '@oak/platform-effect',
    '@oak/platform-effect-react',
    '@oak/react',
    '@oak/effect-runtime-react-provider',
  ],
}

export default nextConfig
