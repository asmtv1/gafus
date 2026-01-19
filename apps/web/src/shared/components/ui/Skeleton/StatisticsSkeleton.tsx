import { Skeleton, Box } from "@shared/utils/muiImports";

export default function StatisticsSkeleton() {
  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", mb: 3 }}>
        <Skeleton variant="circular" width={60} height={60} />
        <Box sx={{ ml: 2 }}>
          <Skeleton variant="text" width={200} height={32} />
          <Skeleton variant="text" width={150} height={20} />
        </Box>
      </Box>

      <Skeleton variant="text" width="100%" height={40} sx={{ mb: 2 }} />

      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {[1, 2, 3].map((item) => (
          <Box key={item} sx={{ p: 2, border: "1px solid #e0e0e0", borderRadius: 2 }}>
            <Skeleton variant="rectangular" width="100%" height={120} />
            <Box sx={{ mt: 1 }}>
              <Skeleton variant="text" width="70%" height={24} />
              <Skeleton variant="text" width="50%" height={16} />
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
