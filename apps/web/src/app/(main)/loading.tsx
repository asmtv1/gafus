import Image from "next/image";
import styles from "./loading.module.css";

export default function Loading() {
  return (
    <div className={styles.container}>
      <Image 
        src="/uploads/logo.png" 
        alt="Гафус" 
        className={styles.logo} 
        width={200} 
        height={200} 
        priority 
      />
      <div className={styles.spinner} />
    </div>
  );
}

