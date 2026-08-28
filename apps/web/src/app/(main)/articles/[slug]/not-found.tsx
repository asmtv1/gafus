import Link from "next/link";
import ArrowBack from "@mui/icons-material/ArrowBack";
import styles from "./ArticleDetailClient.module.css";

export default function ArticleNotFound() {
  return (
    <main className={styles.notFound}>
      <h1>Статья не найдена</h1>
      <Link className={styles.backLink} href="/articles">
        <ArrowBack fontSize="small" aria-hidden="true" />
        <span>К списку статей</span>
      </Link>
    </main>
  );
}
