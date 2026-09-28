"""Regression tests for inline skill-resource validation; no product dependencies."""
import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


MODULE_PATH = Path(__file__).with_name('validate-codex-setup.py')
SPEC = importlib.util.spec_from_file_location('validate_codex_setup', MODULE_PATH)
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)


class RelativeResourceTests(unittest.TestCase):
    def setUp(self):
        self.workspace = tempfile.TemporaryDirectory()
        self.addCleanup(self.workspace.cleanup)
        self.root = Path(self.workspace.name)
        self.skills = self.root / '.codex/skills'
        self.document = self.skills / 'plan-test-specs/SKILL.md'
        self.write('plan-test-specs/SKILL.md')
        self.write('playwright-cli/SKILL.md')

    def write(self, relative):
        path = self.skills / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text('Fixture\n')
        return path

    def failures(self, content, path=None):
        return [message for passed, message in validator.relative_resource_checks(
            self.root, path or self.document, content) if not passed]

    def test_missing_cross_skill_reference_reports_document_and_target(self):
        errors = self.failures('See `playwright-cli/VENDOR.md` for adaptations.')
        self.assertEqual(len(errors), 1)
        self.assertIn('.codex/skills/plan-test-specs/SKILL.md', errors[0])
        self.assertIn('playwright-cli/VENDOR.md', errors[0])

    def test_existing_cross_skill_reference_then_removed_file(self):
        target = self.write('playwright-cli/references/test-generation.md')
        content = 'Read `playwright-cli/references/test-generation.md#examples:12`.'
        self.assertEqual(self.failures(content), [])
        target.unlink()
        self.assertEqual(len(self.failures(content)), 1)

    def test_local_and_parent_relative_resources(self):
        self.write('plan-test-specs/references/setup.md')
        self.assertEqual(self.failures('Read `references/setup.md` and `./references/setup.md`.'), [])
        self.assertEqual(self.failures('Read `../playwright-cli/SKILL.md`.'), [])
        self.assertEqual(len(self.failures('Read `references/missing.md` and `../playwright-cli/missing.md`.')), 2)

    def test_nested_resource_resolves_from_own_directory_and_skill_root(self):
        path = self.write('plan-test-specs/references/guide.md')
        self.write('plan-test-specs/references/detail.md')
        self.assertEqual(self.failures('Read `./detail.md` and `references/detail.md`.', path), [])

    def test_same_named_file_in_other_skill_does_not_mask_missing_local_file(self):
        self.write('playwright-cli/references/setup.md')
        self.assertEqual(len(self.failures('Read `references/setup.md`.')), 1)

    def test_fenced_examples_and_placeholders_are_not_required_inputs(self):
        content = '''Example:
   ```markdown
   Read `playwright-cli/future.md`.
   ```
~~~text
Read `references/example.md`.
~~~
Use `references/{artifact}.md`, `references/*.md`, and `` `references/example.md` ``.
See `https://example.com/missing.md` or run `python3 scripts/future.py`.
Actual input: `playwright-cli/VENDOR.md`.
'''
        errors = self.failures(content)
        self.assertEqual(len(errors), 1)
        self.assertIn('playwright-cli/VENDOR.md', errors[0])

    def test_generator_output_exemptions_do_not_hide_missing_inputs(self):
        path = self.write('generate-test-guide/SKILL.md')
        self.assertEqual(self.failures('Generate `references/gotchas.md`.', path), [])
        self.assertEqual(len(self.failures('Read `references/new-input.md`.', path)), 1)
        self.assertEqual(len(self.failures('Read `references/gotchas.md`.')), 1)

    def test_product_script_is_not_resolved_as_a_skill_resource(self):
        path = self.root / 'docs/codex/rules/next-frontend-bff-api.md'
        self.assertEqual(self.failures('Run `scripts/sync-openapi.sh` in the subproject.', path), [])

    def test_full_validator_rejects_reintroduced_vendor_reference(self):
        root = MODULE_PATH.resolve().parents[1]
        document = root / '.codex/skills/plan-test-specs/SKILL.md'
        original_read = Path.read_text

        def read_with_regression(path, *args, **kwargs):
            content = original_read(path, *args, **kwargs)
            if path == document:
                content += '\nSee `playwright-cli/VENDOR.md` for adaptations.\n'
            return content

        # Inject the original defect in memory; no workspace file is modified.
        with patch.object(Path, 'read_text', read_with_regression):
            _, errors = validator.validate(root)
        self.assertIn(
            'Broken relative resource reference: .codex/skills/plan-test-specs/SKILL.md -> playwright-cli/VENDOR.md',
            errors,
        )


if __name__ == '__main__':
    unittest.main()
