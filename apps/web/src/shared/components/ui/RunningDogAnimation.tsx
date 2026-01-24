"use client";

import styles from "./RunningDogAnimation.module.css";

export function RunningDogAnimation() {
  return (
    <div className={styles.container}>
      <div className={styles.dog}>
        {/* Тело */}
        <div className={styles.body}></div>

        {/* Голова */}
        <div className={styles.head}>
          <div className={styles.ear}></div>
          <div className={`${styles.ear} ${styles.earRight}`}></div>
          <div className={styles.eye}></div>
          <div className={`${styles.eye} ${styles.eyeRight}`}></div>
          <div className={styles.nose}></div>
        </div>

        {/* Передние лапы */}
        <div className={`${styles.leg} ${styles.frontLeg1}`}>
          <div className={styles.paw}></div>
        </div>
        <div className={`${styles.leg} ${styles.frontLeg2}`}>
          <div className={styles.paw}></div>
        </div>

        {/* Задние лапы */}
        <div className={`${styles.leg} ${styles.backLeg1}`}>
          <div className={styles.paw}></div>
        </div>
        <div className={`${styles.leg} ${styles.backLeg2}`}>
          <div className={styles.paw}></div>
        </div>

        {/* Хвост */}
        <div className={styles.tail}></div>
      </div>
    </div>
  );
}
