import { BackButtonLink } from "../../shared/ui";
import { PetCreateS1Form } from "./PetCreateS1Form";
import { navigate } from "../../shared/router/location";

/** The only allowed route transport is an EXPLICIT source/mock fixture.
 * Never infer G1/G2 approval from the existing HTTP submit adapter. */
export type PetAddSourceMock = Readonly<{
  fixtureKind: "AG2_PET_CREATE_SYNTHETIC_ONLY";
  submit: React.ComponentProps<typeof PetCreateS1Form>["submitSynthetic"];
}>;

export function PetAddOptIn({actorId, source}:{actorId:string;source:PetAddSourceMock}){
  if(source.fixtureKind!=="AG2_PET_CREATE_SYNTHETIC_ONLY")return null;
  return <section className="pet-add-optin" aria-label="Добавление питомца">
    <nav aria-label="Навигация по питомцам">
      <BackButtonLink to="/pets">К моим питомцам</BackButtonLink>
    </nav>
    <PetCreateS1Form key={actorId} actorId={actorId}
      submitSynthetic={source.submit} onCancelIntent={()=>navigate("/pets")}/>
  </section>;
}
