/**
 * G04 deliberately opt-in, isolated React harness.
 * Not imported from App, location router, network client or production entry.
 * Passing enabled=true merely mounts local SOURCE/MOCK UI; an injected fixture
 * receives the two Hono-shaped operations. NO real DELETE or POST.
 */
import {AccountDeletionS1Form} from "./AccountDeletionS1Form";
import {createG04SourceMockConsumer,type G04FixtureWire} from "./g04SourceMockConsumer";

type Props={
  enabled:boolean;
  actorId:string;
  hasVerifiedEmail:boolean;
  fixture:G04FixtureWire;
};
export function G04OptInHarness({enabled,actorId,hasVerifiedEmail,fixture}:Props){
  if(!enabled)return <section aria-label="G04 закрыт" className="account-card">
    <p role="status">Удаление аккаунта недоступно до отдельного допуска.</p>
  </section>;
  return <AccountDeletionS1Form key={actorId}
    actorId={actorId} hasVerifiedEmail={hasVerifiedEmail}
    consumer={createG04SourceMockConsumer(fixture)}/>;
}
