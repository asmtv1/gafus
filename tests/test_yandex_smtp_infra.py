"""Regression contracts for the Resend-first mail transport and SMTP fallback.

Keep the legacy discovery filename: these tests replace the obsolete
"Yandex SMTP is always the primary production provider" assertions after the
mailer migration, without skipping any infrastructure tests.
"""
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class MailProviderInfrastructureTest(unittest.TestCase):
    def test_prod_compose_defaults_to_resend_and_preserves_smtp_fallback_without_postfix(self):
        compose = (ROOT / "ci-cd/docker/docker-compose.prod.yml").read_text()
        for forbidden in ("\n  postfix:\n", "gafus-postfix", "postfix_opendkim_keys",
                          "MAIL_ALLOWED_SENDER_DOMAINS", "POSTFIX_"):
            with self.subTest(forbidden=forbidden):
                self.assertNotIn(forbidden, compose)

        # API and Worker both require the exact same primary and fallback config.
        expected = (
            "MAIL_PROVIDER=${MAIL_PROVIDER:-resend}",
            "RESEND_API_KEY=${RESEND_API_KEY:-}",
            "RESEND_WEBHOOK_SECRET=${RESEND_WEBHOOK_SECRET:-}",
            "RESEND_FROM=${RESEND_FROM:-notifications@notify.gafus.ru}",
            "MAIL_REPLY_TO=${MAIL_REPLY_TO:-api@gafus.ru}",
            "SMTP_HOST=${SMTP_HOST:-smtp.yandex.ru}",
            "SMTP_PORT=${SMTP_PORT:-465}",
            "SMTP_SECURE=${SMTP_SECURE:-true}",
            "SMTP_USER=${SMTP_USER}",
            "SMTP_PASS=${SMTP_PASS}",
        )
        for entry in expected:
            with self.subTest(config=entry):
                self.assertEqual(compose.count(f"- {entry}"), 2)

    def test_reusable_release_workflow_supplies_resend_and_smtp_fallback_secrets(self):
        release = (ROOT / ".github/workflows/production-deploy-reusable.yml").read_text()
        expected = (
            "MAIL_PROVIDER=${{ vars.MAIL_PROVIDER || 'resend' }}",
            "RESEND_API_KEY=${{ secrets.RESEND_API_KEY }}",
            "RESEND_WEBHOOK_SECRET=${{ secrets.RESEND_WEBHOOK_SECRET }}",
            "MAIL_OUTBOX_ENCRYPTION_KEY=${{ secrets.MAIL_OUTBOX_ENCRYPTION_KEY }}",
            "RESEND_FROM=${{ vars.RESEND_FROM || 'notifications@notify.gafus.ru' }}",
            "SMTP_USER=${{ secrets.SMTP_USER }}",
            "SMTP_PASS=${{ secrets.SMTP_PASS }}",
        )
        for entry in expected:
            with self.subTest(config=entry):
                self.assertEqual(release.count(entry), 1)
        for workflow_name in ("ci-cd.yml", "deploy-only.yml"):
            with self.subTest(workflow=workflow_name):
                workflow = (ROOT / ".github/workflows" / workflow_name).read_text()
                self.assertIn("./.github/workflows/production-deploy-reusable.yml", workflow)
                self.assertNotIn("gafus-postfix", workflow)

    def test_manual_single_container_build_does_not_inject_legacy_smtp_credentials(self):
        workflow = (ROOT / ".github/workflows/build-single-container.yml").read_text()
        self.assertIn("MISSING_PREVIOUS_IMAGE", workflow)
        self.assertIn("PRODUCTION_SHA_DIFFERS", workflow)
        # Manual single image deployment must not independently rewrite the
        # existing server's environment or overwrite transactional-mail secrets.
        for key in ("SMTP_PASS", "RESEND_API_KEY", "MAIL_PROVIDER"):
            with self.subTest(key=key):
                self.assertNotIn(f'ensure_env_var "{key}"', workflow)
        self.assertNotIn("gafus-postfix", workflow)

    def test_docs_identify_resend_as_primary_and_smtp_as_explicit_fallback(self):
        mailer_doc = (ROOT / "docs/packages/mailer.md").read_text()
        deployment_doc = (ROOT / "docs/deployment/configuration.md").read_text()
        for doc in (mailer_doc, deployment_doc):
            with self.subTest(document=doc[:60]):
                self.assertIn("MAIL_PROVIDER=resend", doc)
                self.assertIn("RESEND_API_KEY", doc)
                self.assertIn("RESEND_FROM", doc)
                self.assertIn("MAIL_PROVIDER=smtp", doc)
                self.assertIn("SMTP_HOST", doc)
        self.assertIn("RESEND_WEBHOOK_SECRET", mailer_doc)
        self.assertNotIn("SMTP/Postfix в Docker", mailer_doc)


if __name__ == "__main__":
    unittest.main()
