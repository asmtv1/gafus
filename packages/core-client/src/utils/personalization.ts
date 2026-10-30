import petrovich from "petrovich";

type PetrovichPerson = {
  gender?: string;
  first: string;
  last?: string;
  middle?: string;
};
type PetrovichCase = "genitive" | "dative" | "accusative" | "instrumental" | "prepositional";
const petrovichFn = petrovich as (
  person: PetrovichPerson,
  caseName: PetrovichCase,
) => { first: string; last?: string; middle?: string; gender?: string } | null;

export interface DeclinedName {
  nominative: string;
  genitive: string;
  dative: string;
  accusative: string;
  instrumental: string;
  prepositional: string;
}

/**
 * Склоняет русское имя по всем шести падежам.
 * Для питомца (без пола) передавать gender === undefined → используется 'androgynous'.
 * Пустую строку не передавать в petrovich; при ошибке возвращает name во всех полях.
 */
export function declineRussianName(
  name: string,
  gender?: "male" | "female",
): DeclinedName {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) {
    return {
      nominative: "",
      genitive: "",
      dative: "",
      accusative: "",
      instrumental: "",
      prepositional: "",
    };
  }
  const petrovichGender = gender ?? "androgynous";
  const base = { gender: petrovichGender, first: trimmed };
  const fallback = (res: { first?: string } | null): string =>
    (res?.first ?? trimmed) as string;
  try {
    return {
      nominative: trimmed,
      genitive: fallback(petrovichFn(base, "genitive")),
      dative: fallback(petrovichFn(base, "dative")),
      accusative: fallback(petrovichFn(base, "accusative")),
      instrumental: fallback(petrovichFn(base, "instrumental")),
      prepositional: fallback(petrovichFn(base, "prepositional")),
    };
  } catch {
    return {
      nominative: trimmed,
      genitive: trimmed,
      dative: trimmed,
      accusative: trimmed,
      instrumental: trimmed,
      prepositional: trimmed,
    };
  }
}

export interface PersonalizationData {
  userDisplayName: string;
  userGender: "male" | "female";
  petName: string;
  petGender?: "male" | "female" | null;
  petNameGen?: string | null;
  petNameDat?: string | null;
  petNameAcc?: string | null;
  petNameIns?: string | null;
  petNamePre?: string | null;
}

/**
 * Заменяет плейсхолдеры персонализации в тексте.
 * Имена: {{userName}}, {{userNameGen}}, … {{userNamePre}}; {{petName}}, {{petNameGen}}, … {{petNamePre}}.
 * Согласование по полу: {{userGenderPronoun:Он|Она}}, {{userGenderAdj:серьёзен|серьёзна}},
 * {{userGenderVerb:ждал|ждала}}, {{userGenderPoss:его|её}} (и аналогично petGender*).
 * Для питомца при petGender === null используется мужской вариант.
 */
export function replacePersonalizationPlaceholders(
  text: string,
  personalization: PersonalizationData,
): string {
  const user = declineRussianName(
    personalization.userDisplayName,
    personalization.userGender,
  );
  const petGender =
    personalization.petGender === "female" || personalization.petGender === "male"
      ? personalization.petGender
      : undefined;
  const pet = declineRussianName(personalization.petName, petGender);
  const petGen = personalization.petNameGen?.trim() || pet.genitive;
  const petDat = personalization.petNameDat?.trim() || pet.dative;
  const petAcc = personalization.petNameAcc?.trim() || pet.accusative;
  const petIns = personalization.petNameIns?.trim() || pet.instrumental;
  const petPre = personalization.petNamePre?.trim() || pet.prepositional;
  const petNom = personalization.petName?.trim() ?? "";

  let result = text;
  result = result.replace(/\{\{userName\}\}/g, user.nominative);
  result = result.replace(/\{\{userNameGen\}\}/g, user.genitive);
  result = result.replace(/\{\{userNameDat\}\}/g, user.dative);
  result = result.replace(/\{\{userNameAcc\}\}/g, user.accusative);
  result = result.replace(/\{\{userNameIns\}\}/g, user.instrumental);
  result = result.replace(/\{\{userNamePre\}\}/g, user.prepositional);
  result = result.replace(/\{\{petName\}\}/g, petNom);
  result = result.replace(/\{\{petNameGen\}\}/g, petGen);
  result = result.replace(/\{\{petNameDat\}\}/g, petDat);
  result = result.replace(/\{\{petNameAcc\}\}/g, petAcc);
  result = result.replace(/\{\{petNameIns\}\}/g, petIns);
  result = result.replace(/\{\{petNamePre\}\}/g, petPre);

  const userIsFemale = personalization.userGender === "female";
  const petIsFemale = personalization.petGender === "female";
  const pickUser = (male: string, female: string) => (userIsFemale ? female : male);
  const pickPet = (male: string, female: string) => (petIsFemale ? female : male);

  result = result.replace(
    /\{\{userGender(Pronoun|Adj|Verb|Poss):([^|]+)\|([^}]*)\}\}/g,
    (_, _kind, maleVal, femaleVal) => pickUser(maleVal, femaleVal),
  );
  result = result.replace(
    /\{\{petGender(Pronoun|Adj|Verb|Poss):([^|]+)\|([^}]*)\}\}/g,
    (_, _kind, maleVal, femaleVal) => pickPet(maleVal, femaleVal),
  );

  return result;
}
