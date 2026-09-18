import type { NextConfig } from "next";

const securityHeaders=[
  {key:'X-Content-Type-Options',value:'nosniff'},
  {key:'X-Frame-Options',value:'DENY'},
  {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
  {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'},
  {key:'Cross-Origin-Opener-Policy',value:'same-origin'},
  {key:'X-DNS-Prefetch-Control',value:'off'},
  {key:'X-Permitted-Cross-Domain-Policies',value:'none'},
  {key:'Origin-Agent-Cluster',value:'?1'},
  {key:'Strict-Transport-Security',value:'max-age=63072000; includeSubDomains; preload'},
];

const noStoreHeaders=[
  {key:'Cache-Control',value:'private, no-store, max-age=0'},
  {key:'Pragma',value:'no-cache'},
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers(){
    return[
      {source:'/:path*',headers:securityHeaders},
      {source:'/admin/:path*',headers:noStoreHeaders},
      {source:'/funded/:path*',headers:noStoreHeaders},
      {source:'/api/funded/:path*',headers:noStoreHeaders},
      {source:'/api/health',headers:[{key:'Cache-Control',value:'no-store'}]},
    ]
  },
};
export default nextConfig;
