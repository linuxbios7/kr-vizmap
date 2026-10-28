import type { NextConfig } from "next";

// 배포 방식
//  - 서버 모드(기본): 브라우저는 같은 오리진의 /api 로 호출하고, Next 서버가 FastAPI로 프록시한다.
//  - 정적 모드(NEXT_EXPORT=1): GitHub Pages용. 정적 파일(out/)만 만들고 데이터는 /data/*.json 을 읽는다.
//    프로젝트 페이지(https://<user>.github.io/<repo>/)는 NEXT_BASE_PATH=/<repo> 로 빌드한다.
const isExport = process.env.NEXT_EXPORT === "1";
const basePath = process.env.NEXT_BASE_PATH ?? "";
// localhost는 IPv6(::1)를 먼저 시도해 지연될 수 있어 127.0.0.1을 기본으로 쓴다.
const backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  // Docker 이미지는 standalone 산출물을 쓴다 (NEXT_STANDALONE=1).
  output: isExport ? "export" : process.env.NEXT_STANDALONE === "1" ? "standalone" : undefined,
  // E2E는 별도 빌드 폴더를 써서 개발용 .next와 섞이지 않게 한다.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  basePath: basePath || undefined,
  trailingSlash: isExport,
  // 클라이언트 코드에서 읽는 값 (lib/dataSource.ts)
  env: { KRMAP_STATIC: isExport ? "1" : "0", KRMAP_BASE_PATH: basePath },
  // 정적 내보내기에는 rewrites가 없다
  ...(isExport
    ? {}
    : {
        async rewrites() {
          return [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }];
        },
      }),
};

export default nextConfig;
