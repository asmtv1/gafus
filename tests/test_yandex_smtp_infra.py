import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]


class YandexSmtpInfraTest(unittest.TestCase):
    def test_prod_compose_uses_yandex_smtp_without_postfix_service(self):
        compose = (ROOT / "ci-cd/docker/docker-compose.prod.yml").read_text()

        self.assertNotIn("\n  postfix:\n", compose)
        self.assertNotIn("gafus-postfix", compose)
        self.assertNotIn("postfix_opendkim_keys", compose)
        self.assertNotIn("MAIL_ALLOWED_SENDER_DOMAINS", compose)
        self.assertNotIn("POSTFIX_", compose)

        expected_defaults = [
            "SMTP_HOST=${SMTP_HOST:-smtp.yandex.ru}",
            "SMTP_PORT=${SMTP_PORT:-465}",
            "SMTP_SECURE=${SMTP_SECURE:-true}",
            "SMTP_USER=${SMTP_USER}",
            "SMTP_PASS=${SMTP_PASS}",
            "MAIL_FROM=${MAIL_FROM:-api@gafus.ru}",
            "MAIL_FROM_NAME=${MAIL_FROM_NAME:-Гафус}",
        ]
        for default in expected_defaults:
            with self.subTest(default=default):
                self.assertEqual(compose.count(f"- {default}"), 3)

    def test_workflows_write_yandex_smtp_env_without_postfix_references(self):
        workflow_paths = [
            ROOT / ".github/workflows/ci-cd.yml",
            ROOT / ".github/workflows/deploy-only.yml",
            ROOT / ".github/workflows/build-single-container.yml",
        ]

        for path in workflow_paths:
            workflow = path.read_text()
            with self.subTest(workflow=path.name):
                self.assertIn("# SMTP / Yandex 360", workflow)
                self.assertIn("SMTP_HOST=${{ vars.SMTP_HOST || 'smtp.yandex.ru' }}", workflow)
                self.assertIn("SMTP_PORT=${{ vars.SMTP_PORT || '465' }}", workflow)
                self.assertIn("SMTP_SECURE=${{ vars.SMTP_SECURE || 'true' }}", workflow)
                self.assertIn("SMTP_USER=${{ secrets.SMTP_USER }}", workflow)
                self.assertIn("SMTP_PASS=${{ secrets.SMTP_PASS }}", workflow)
                self.assertIn("MAIL_FROM=${{ vars.MAIL_FROM || 'api@gafus.ru' }}", workflow)
                self.assertIn("MAIL_FROM_NAME=${{ vars.MAIL_FROM_NAME || 'Гафус' }}", workflow)
                self.assertNotIn("MAIL_ALLOWED_SENDER_DOMAINS", workflow)
                self.assertNotIn("POSTFIX_MYHOSTNAME", workflow)
                self.assertNotIn("gafus-postfix", workflow)
                self.assertNotIn(" postgres redis postfix", workflow)

    def test_single_container_deploy_updates_smtp_in_existing_env(self):
        workflow = (ROOT / ".github/workflows/build-single-container.yml").read_text()

        for key in [
            "SMTP_HOST",
            "SMTP_PORT",
            "SMTP_SECURE",
            "SMTP_USER",
            "SMTP_PASS",
            "MAIL_FROM",
            "MAIL_FROM_NAME",
        ]:
            with self.subTest(key=key):
                self.assertIn(f'ensure_env_var "{key}"', workflow)

    def test_docs_describe_yandex_360_as_production_smtp(self):
        mailer_doc = (ROOT / "docs/packages/mailer.md").read_text()
        deployment_doc = (ROOT / "docs/deployment/configuration.md").read_text()

        self.assertIn("Яндекс 360", mailer_doc)
        self.assertIn("smtp.yandex.ru", mailer_doc)
        self.assertNotIn("SMTP/Postfix в Docker", mailer_doc)

        self.assertIn("Яндекс 360", deployment_doc)
        self.assertIn("smtp.yandex.ru", deployment_doc)
        self.assertNotIn("smtp.gmail.com", deployment_doc)
