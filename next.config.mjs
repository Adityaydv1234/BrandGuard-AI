/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@electric-sql/pglite', 'pg', 'unpdf', 'mammoth'],
  },
};
export default nextConfig;
