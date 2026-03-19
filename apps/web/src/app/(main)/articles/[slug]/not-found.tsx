import Link from "next/link";

export default function ArticleNotFound() {
  return (
    <main style={{ padding: 24, textAlign: "center" }}>
      <h1>Статья не найдена</h1>
      <Link href="/articles">← К списку статей</Link>
    </main>
  );
}
