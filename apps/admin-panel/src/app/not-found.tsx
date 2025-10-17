import Link from "next/link";
import { Box, Container, Typography, Button } from "@mui/material";

export default function NotFound() {
  return (
    <Container maxWidth="md">
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          textAlign: "center",
        }}
      >
        <Typography variant="h1" component="h1" gutterBottom>
          404
        </Typography>
        <Typography variant="h5" component="h2" gutterBottom>
          Страница не найдена
        </Typography>
        <Typography variant="body1" color="text.secondary" paragraph>
          Запрашиваемая страница не существует
        </Typography>
        <Button variant="contained" component={Link} href="/">
          На главную
        </Button>
      </Box>
    </Container>
  );
}

