declare module "petrovich" {
  type Person = {
    gender?: string;
    first: string;
    last?: string;
    middle?: string;
  };
  type CaseName = "genitive" | "dative" | "accusative" | "instrumental" | "prepositional";
  type Result = { first: string; last?: string; middle?: string; gender?: string };
  function petrovich(person: Person, caseName: CaseName): Result | null;
  export default petrovich;
}
