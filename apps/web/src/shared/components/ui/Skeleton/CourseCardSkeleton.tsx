import { Skeleton, Box } from "@/utils/muiImports";

export default function CourseCardSkeleton() {
  return (
    <Box sx={{ p: 2, border: "1px solid #e0e0e0", borderRadius: 2, mb: 2 }}>
      <Skeleton variant="rectangular" width="100%" height={200} />
      <Box sx={{ mt: 1 }}>
        <Skeleton variant="text" width="60%" height={24} />
        <Skeleton variant="text" width="40%" height={20} />
        <Skeleton variant="text" width="80%" height={16} />
        <Box sx={{ display: "flex", alignItems: "center", mt: 1 }}>
          <Skeleton variant="circular" width={20} height={20} />
          <Skeleton variant="text" width={60} height={16} sx={{ ml: 1 }} />
        </Box>
      </Box>
    </Box>
  );
}
