/** @type {import('next').NextConfig} */
const nextConfig = {
  // Webpack configuration to handle nostr-tools
  webpack: (config) => {
    // Add fallbacks for crypto modules
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    
    return config;
  },
  // Allow importing SVGs as React components
  images: {
    dangerouslyAllowSVG: true,
  },
};

export default nextConfig; 