import chevronSvg from "./SelectChevron.svg";
import "./SelectChevron.css";

type ChevronProps = {
  expanded?: boolean;
  className?: string;
};

/** One shared SVG asset for native selects and disclosure controls across Web. */
export function SelectChevron({ expanded = false, className }: ChevronProps) {
  return <img src={chevronSvg} alt="" aria-hidden="true"
    className={["gafus-select-chevron", expanded && "gafus-select-chevron-expanded", className]
      .filter(Boolean).join(" ")} />;
}
