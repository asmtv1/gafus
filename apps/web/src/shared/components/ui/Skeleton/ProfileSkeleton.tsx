import { Skeleton, Box } from "@shared/utils/muiImports";

export default function ProfileSkeleton() {
  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", mb: 3 }}>
        <Skeleton variant="circular" width={120} height={120} />
        <Box sx={{ ml: 3 }}>
          <Skeleton variant="text" width={250} height={32} />
          <Skeleton variant="text" width={180} height={20} />
          <Skeleton variant="text" width={120} height={16} />
        </Box>
      </Box>

      <Box sx={{ mb: 3 }}>
        <Skeleton variant="text" width="100%" height={24} sx={{ mb: 1 }} />
        <Skeleton variant="text" width="80%" height={16} />
        <Skeleton variant="text" width="60%" height={16} />
      </Box>

      <Box sx={{ mb: 3 }}>
        <Skeleton variant="text" width={150} height={28} sx={{ mb: 2 }} />
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {[1, 2].map((item) => (
            <Box key={item} sx={{ p: 2, border: "1px solid #e0e0e0", borderRadius: 2 }}>
              <Box sx={{ display: "flex", alignItems: "center" }}>
                <Skeleton variant="circular" width={50} height={50} />
                <Box sx={{ ml: 2, flex: 1 }}>
                  <Skeleton variant="text" width="70%" height={20} />
                  <Skeleton variant="text" width="50%" height={16} />
                  <Skeleton variant="text" width="40%" height={14} />
                </Box>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>

      <Box>
        <Skeleton variant="text" width={120} height={28} sx={{ mb: 2 }} />
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {[1, 2, 3].map((item) => (
            <Skeleton key={item} variant="text" width="100%" height={16} />
          ))}
        </Box>
      </Box>
    </Box>
  );
}
