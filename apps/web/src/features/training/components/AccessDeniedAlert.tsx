"use client";

import { useEffect } from "react";
import { showPrivateCourseAccessDeniedAlert } from "@shared/utils/sweetAlert";

interface AccessDeniedAlertProps {
  courseType: string;
}

export function AccessDeniedAlert({ courseType: _courseType }: AccessDeniedAlertProps) {
  useEffect(() => {
    showPrivateCourseAccessDeniedAlert();
  }, []);

  return null;
}
