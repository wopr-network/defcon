/**
 * Flow Design Examples — one per language ecosystem.
 *
 * Selected at render time based on the repo's primary language.
 * Each example uses the REAL prompts from engineering.ts as the base,
 * with only language-specific adaptations (CI gate command, tool names,
 * conventions, review focus areas).
 */

export interface FlowDesignExample {
  language: string;
  description: string;
  /** The full FLOW_DESIGN:... + DESIGN_NOTES:... block */
  output: string;
}

/**
 * Select the best example for a repo based on its languages.
 * Falls back to TypeScript if no match.
 */
export function selectExample(languages: string[]): FlowDesignExample {
  const primary = languages[0]?.toLowerCase() ?? "";

  for (const example of EXAMPLES) {
    if (example.language === primary) return example;
  }

  // Fuzzy matches
  if (primary.includes("python")) return getExample("python");
  if (primary === "kotlin") return getExample("kotlin");
  if (primary.includes("java")) return getExample("java");
  if (primary.includes("ruby")) return getExample("ruby");
  if (primary.includes("csharp") || primary.includes("c#") || primary === "dotnet") return getExample("csharp");
  if (primary === "swift") return getExample("swift");
  if (primary === "php") return getExample("php");
  if (primary === "elixir" || primary === "erlang") return getExample("elixir");
  if (primary === "c" || primary === "cpp" || primary === "c++") return getExample("cpp");
  if (primary === "dart" || primary === "flutter") return getExample("dart");
  if (primary === "scala") return getExample("java"); // close enough

  return getExample("typescript");
}

function getExample(lang: string): FlowDesignExample {
  return EXAMPLES.find((e) => e.language === lang) ?? EXAMPLES[0];
}

// ─── Language-specific adaptations ───
// These are the ONLY parts that change per language.
// Everything else is the real prompt from engineering.ts.

interface LanguageAdaptation {
  language: string;
  description: string;
  repoExample: string;
  ciGateCommand: string;
  ciGateTimeout: number;
  conventions: string;
  /** Injected into the spec prompt — what to pay attention to when reading THIS kind of codebase. */
  specGuidance: string;
  /** Injected into the code prompt — how to write idiomatic code in THIS language. */
  codeGuidance: string;
  /** Injected into the review prompt — what's uniquely dangerous or important in THIS ecosystem. */
  reviewGuidance: string;
  reviewFocus: string;
  docStyle: string;
  hasDocs: boolean;
  hasReviewBots: boolean;
  reviewBotNames: string;
  hasMergeQueue: boolean;
  mergeCommand: string;
  designNotes: string;
}

const ADAPTATIONS: LanguageAdaptation[] = [
  {
    language: "typescript",
    description: "TypeScript API with biome, vitest, GitHub Actions, merge queue, no docs",
    repoExample: "acme/api — TypeScript API",
    ciGateCommand: "pnpm lint && pnpm build && pnpm test",
    ciGateTimeout: 600000,
    conventions: `- Conventional commits (feat:, fix:, chore:)
- biome for lint and format
- All imports sorted: external → parent → sibling
- Tests colocated in tests/ mirroring src/ structure
- vitest with 98% coverage threshold`,
    specGuidance: `Pay attention to the TypeScript module structure. Understand which types are exported and where the boundaries between modules are. When specifying new code, include full TypeScript type signatures — interfaces, generics, union types. If the codebase uses barrel exports (index.ts re-exports), follow that pattern. Consider impact on the build — new files need to be reachable from the compilation root.`,
    codeGuidance: `Write idiomatic TypeScript. Use \`import type\` for type-only imports — biome enforces this. Keep imports sorted: external packages first, then parent directories (../), then siblings (./), alphabetical within each group. Write tests alongside the implementation — this repo requires 98% coverage, so test every branch. Use vitest's \`describe\`/\`it\`/\`expect\` API. If adding a new module, export it from the nearest barrel file.`,
    reviewGuidance: `TypeScript-specific: check that \`import type\` is used for type-only imports (biome will catch this but flag it anyway). Verify import ordering follows the convention. Look for \`any\` types that should be narrowed. Check for missing error handling on async operations. Verify that new exports are intentional — unused exports bloat the public API. Check test quality: are edge cases covered? Are assertions specific enough? This repo requires 98% coverage — verify new code is tested.`,
    reviewFocus: "import ordering violations, unused exports, type safety gaps",
    docStyle: "JSDoc",
    hasDocs: false,
    hasReviewBots: false,
    reviewBotNames: "",
    hasMergeQueue: true,
    mergeCommand: "gh pr merge --auto",
    designNotes:
      "Removed docs state — docs.supported is false, review(clean) goes to learning. Code/fix prompts use exact CI gate (pnpm lint && pnpm build && pnpm test). Merge uses merge queue (gh pr merge --auto). Review checks 98% coverage threshold. Prompts reference biome and conventional commits.",
  },
  {
    language: "python",
    description: "Python ML service with ruff, pytest, poetry, GitHub Actions, has docs, no merge queue",
    repoExample: "acme/ml-service — Python ML service",
    ciGateCommand: "ruff check . && ruff format --check . && pytest --cov=src --cov-fail-under=85",
    ciGateTimeout: 480000,
    conventions: `- Type hints on all public functions
- Docstrings (Google style) on all public functions
- ruff for lint and format
- pytest with fixtures in conftest.py
- poetry for dependency management
- If adding dependencies, use: poetry add <package>`,
    specGuidance: `Study the Python package structure — look for __init__.py files to understand module boundaries and what's publicly importable. Identify type hint coverage: if the codebase uses typing extensively, your spec must include full function signatures with type annotations, including generics (TypeVar, Generic), Protocol classes, and Optional/Union types. Pay attention to how data flows through the ML pipeline — inputs, transformations, model interfaces, output schemas. If the project uses dataclasses or Pydantic models, new data structures should follow the same pattern. Consider whether new code needs to be compatible with existing serialization (pickle, joblib) or config systems (hydra, omegaconf).`,
    codeGuidance: `Write Pythonic code — use list comprehensions over map/filter, context managers for resource handling, and pathlib over os.path. Every public function needs a Google-style docstring with Args, Returns, and Raises sections — ruff will flag missing ones. Add type hints to all function signatures and use \`from __future__ import annotations\` for forward references. Structure tests using pytest fixtures in conftest.py — prefer fixtures over setUp/tearDown. Use \`poetry add\` for new dependencies, never pip install directly. If working with ML code, ensure reproducibility: set random seeds, pin dependency versions, and document any non-deterministic behavior.`,
    reviewGuidance: `Python-specific: verify type hints are present on all public function signatures — the codebase enforces this convention. Check that docstrings follow Google style (not numpy or reST). Look for bare \`except:\` or \`except Exception:\` that swallow errors — these hide bugs in production. Verify ML-specific concerns: is there data leakage between train/test splits? Are random seeds set? Are model artifacts reproducible? Check for mutable default arguments (\`def f(x=[])\`) which is a classic Python trap. Verify fixtures in conftest.py are scoped correctly (function vs session) — over-broad scoping causes test pollution. Ensure \`poetry.lock\` is committed if dependencies changed.`,
    reviewFocus:
      "type hint coverage, missing docstrings, ML-specific issues (data leakage, reproducibility), test fixture hygiene",
    docStyle: "Google-style docstrings, docs/ directory",
    hasDocs: true,
    hasReviewBots: false,
    reviewBotNames: "",
    hasMergeQueue: false,
    mergeCommand: "gh pr merge --squash",
    designNotes:
      "Kept docs state — this repo has docs/. Prompts reference ruff (not eslint/biome), pytest with 85% coverage, poetry for deps. Review includes ML-specific checks (data leakage, reproducibility). CI timeout 8 min for pytest suite. Merge uses gh pr merge --squash (no merge queue).",
  },
  {
    language: "go",
    description: "Go microservice with golangci-lint, go test, GitHub Actions, no docs, no merge queue",
    repoExample: "acme/auth-svc — Go microservice",
    ciGateCommand: "golangci-lint run ./... && go test -race -cover ./...",
    ciGateTimeout: 300000,
    conventions: `- Standard Go project layout (cmd/, internal/, pkg/)
- gofmt is law — code must be formatted
- Errors are values — wrap with fmt.Errorf("context: %w", err)
- Table-driven tests
- No global state
- Interfaces accepted, structs returned`,
    specGuidance: `Understand the Go package layout — cmd/ for entrypoints, internal/ for private packages, pkg/ for public libraries. Read the existing interfaces carefully: Go interfaces are satisfied implicitly, so your spec must describe which interfaces new types implement and where they're consumed. Pay attention to error types — does the codebase define sentinel errors (var ErrNotFound = errors.New(...)), custom error types, or just wrap with fmt.Errorf? New code must follow the same pattern. Consider goroutine lifecycle: if you're designing concurrent code, specify which goroutines own which channels, who closes them, and how cancellation propagates via context.Context.`,
    codeGuidance: `Write idiomatic Go. Every error must be checked — never use \`_ = someFunc()\` to discard errors. Wrap errors with context using \`fmt.Errorf("doing X: %w", err)\` so stack traces are useful. Write table-driven tests: define a \`tests\` slice of structs with name, input, and expected output, then range over them in a subtest loop using \`t.Run(tt.name, ...)\`. Accept interfaces, return structs — this keeps packages decoupled. Use \`context.Context\` as the first parameter for anything that does I/O or might be cancelled. Run \`go vet\` and \`golangci-lint\` locally before pushing. Avoid init() functions and package-level mutable state — they make testing painful.`,
    reviewGuidance: `Go-specific: verify every error return is handled — the compiler doesn't enforce this, so it's the reviewer's job. Check for goroutine leaks: every goroutine must have a clear termination condition, usually via context cancellation or channel close. Look for race conditions — if the code touches shared state from multiple goroutines without a mutex or channel, flag it (the CI runs \`go test -race\` but not all paths may be exercised). Verify that interfaces are minimal (1-2 methods) and defined where they're consumed, not where they're implemented. Check for unnecessary pointer receivers on small structs — they add heap allocation pressure. Ensure new packages don't create import cycles.`,
    reviewFocus: "error handling (no swallowed errors), race conditions, interface compliance, unnecessary allocations",
    docStyle: "godoc comments",
    hasDocs: false,
    hasReviewBots: false,
    reviewBotNames: "",
    hasMergeQueue: false,
    mergeCommand: "gh pr merge --squash",
    designNotes:
      "No docs state. Go-specific: prompts emphasize error wrapping, interfaces, table-driven tests, race detector. CI gate uses golangci-lint + go test -race. CI timeout 5 min (Go builds fast). No merge queue — squash merge.",
  },
  {
    language: "rust",
    description: "Rust CLI with clippy, cargo test, GitHub Actions, no docs, no merge queue",
    repoExample: "acme/ctl — Rust CLI",
    ciGateCommand: "cargo clippy -- -D warnings && cargo test && cargo build --release",
    ciGateTimeout: 900000,
    conventions: `- clippy warnings are errors (deny warnings)
- All public types documented
- Error handling via thiserror + anyhow
- No unsafe unless justified and documented in a SAFETY comment
- Prefer iterators over loops, Result over panic`,
    specGuidance: `Study the crate's module tree — look at lib.rs or main.rs to understand the public API surface and re-exports. Identify which error types exist: does the codebase use thiserror for library errors and anyhow for application code, or a unified error enum? Your spec must include full type signatures with lifetime annotations where needed. Pay attention to trait bounds — if existing code is generic over traits like \`Send + Sync + 'static\`, new code must respect those constraints. Consider ownership: specify which functions take ownership, which borrow, and which return owned vs borrowed data. If the crate has a builder pattern or typestate pattern, new APIs should be consistent.`,
    codeGuidance: `Write idiomatic Rust. Use \`Result<T, E>\` for fallible operations — never panic in library code. Define error types with thiserror (\`#[derive(Error, Debug)]\`) and use \`?\` for propagation. Prefer iterators and combinators (\`.map()\`, \`.filter()\`, \`.collect()\`) over manual loops. Use \`#[derive(Debug, Clone, PartialEq)]\` on data types — clippy will suggest missing derives. Write tests in a \`#[cfg(test)] mod tests\` block at the bottom of each file. Use \`assert_eq!\` with descriptive messages. Avoid \`.unwrap()\` outside of tests — use \`.expect("reason")\` if you must, but prefer \`?\`. Keep unsafe blocks minimal and always add a \`// SAFETY:\` comment explaining the invariant that makes it sound.`,
    reviewGuidance: `Rust-specific: the compiler handles memory safety and data races, so focus your review on logic, API design, and performance. Check for unnecessary \`.clone()\` calls — they often indicate an ownership design problem. Verify that \`unsafe\` blocks have a \`// SAFETY:\` comment and that the stated invariant actually holds. Look for \`.unwrap()\` in non-test code — it's a panic waiting to happen. Check that error types are specific enough (not just \`anyhow::Error\` everywhere in library code). Verify that public APIs are minimal — don't expose implementation details. Check for missing \`#[must_use]\` on functions that return important values. Ensure clippy runs clean with \`-D warnings\` — the CI enforces this.`,
    reviewFocus:
      "unsafe usage (must be justified), unnecessary clones/allocations, error handling patterns, API design",
    docStyle: "rustdoc",
    hasDocs: false,
    hasReviewBots: false,
    reviewBotNames: "",
    hasMergeQueue: false,
    mergeCommand: "gh pr merge --squash",
    designNotes:
      "No docs state. Rust-specific: review prompt notes the compiler handles memory safety, so focus on design/unsafe/performance. CI timeout 15 min — Rust release builds are slow. Clippy with -D warnings. Prompts emphasize thiserror+anyhow, no unnecessary clones.",
  },
  {
    language: "java",
    description:
      "Java Spring Boot API with checkstyle, JUnit 5, Gradle, GitHub Actions, has docs, CodeRabbit review bot",
    repoExample: "acme/order-api — Java Spring Boot",
    ciGateCommand: "./gradlew check && ./gradlew test && ./gradlew build",
    ciGateTimeout: 900000,
    conventions: `- Spring Boot 3 with constructor injection (no @Autowired on fields)
- JUnit 5 with @SpringBootTest for integration, plain JUnit for unit
- Checkstyle enforced in CI
- Gradle wrapper (./gradlew)
- DTOs for API boundaries, entities for persistence`,
    specGuidance: `Understand the Spring Boot application structure — look for @Configuration classes to understand bean wiring, @RestController or @Controller classes for the API surface, and @Service/@Repository classes for the business/data layers. Identify the DTO vs entity boundary: does the codebase use MapStruct, ModelMapper, or manual mapping? Your spec must include full method signatures with Java generics where applicable. Pay attention to transaction boundaries — which service methods are @Transactional, and does the codebase use read-only transactions for queries? If the project uses JPA, consider entity relationships (lazy vs eager), cascade types, and the N+1 query implications of your design.`,
    codeGuidance: `Write idiomatic Spring Boot 3 Java. Use constructor injection exclusively — never \`@Autowired\` on fields. Define DTOs as Java records where possible (\`record CreateOrderRequest(String name, int quantity) {}\`). Write unit tests with plain JUnit 5 (\`@Test\`, \`assertThat\`) and integration tests with \`@SpringBootTest\`. Use \`@Transactional\` on service methods that mutate data, and \`@Transactional(readOnly = true)\` on read-only queries. Validate request DTOs with Jakarta Bean Validation annotations (\`@NotNull\`, \`@Size\`, \`@Valid\`). Use \`./gradlew check\` to run checkstyle before pushing. When adding dependencies, use the Gradle version catalog or declare them in build.gradle.kts with explicit version management.`,
    reviewGuidance: `Java/Spring-specific: check for field injection (\`@Autowired\` on fields) — it must be constructor injection. Verify \`@Transactional\` is present on service methods that write data, and that read-only methods use \`readOnly = true\`. Look for N+1 queries: if an entity has a lazy collection that's accessed in a loop, it will fire a query per iteration — suggest \`@EntityGraph\` or a JOIN FETCH query. Check for SQL injection in any \`@Query\` with string concatenation. Verify that input validation annotations are present on request DTOs and that \`@Valid\` is on the controller parameter. Check for missing error handling — Spring's default 500 response leaks stack traces. Verify CodeRabbit findings are addressed before approving.`,
    reviewFocus:
      "Spring anti-patterns (field injection, missing @Transactional), SQL injection, missing validation, N+1 queries",
    docStyle: "Javadoc on all public classes and methods, docs/ directory",
    hasDocs: true,
    hasReviewBots: true,
    reviewBotNames: "CodeRabbit",
    hasMergeQueue: false,
    mergeCommand: "gh pr merge --squash",
    designNotes:
      "Full pipeline — docs state included. Review prompt instructs checking CodeRabbit comments. CI timeout 15 min for Gradle. Prompts reference Spring Boot conventions (constructor injection, @Transactional). Merge verifies CodeRabbit has no unresolved findings.",
  },
  {
    language: "ruby",
    description: "Ruby on Rails app with rubocop, rspec, bundler, GitHub Actions, no docs, no merge queue",
    repoExample: "acme/webapp — Ruby on Rails",
    ciGateCommand: "bundle exec rubocop && bundle exec rspec",
    ciGateTimeout: 600000,
    conventions: `- Rails conventions (fat models, skinny controllers)
- rubocop enforced
- rspec with FactoryBot for test data
- Database migrations via rails generate migration
- Strong parameters for mass assignment protection`,
    specGuidance: `Study the Rails application structure — look at config/routes.rb for the API surface, app/models/ for the domain model and validations, and app/controllers/ for request handling. Understand the existing associations: has_many, belongs_to, has_many :through — your spec must describe how new models relate to existing ones and what foreign keys are needed. Pay attention to the migration history: does the codebase use reversible migrations, or are some irreversible? If the project uses concerns or service objects, follow that pattern. Check for existing scopes on models — new query patterns should use scopes rather than raw ActiveRecord chains scattered through controllers.`,
    codeGuidance: `Write idiomatic Rails. Follow fat models, skinny controllers — business logic belongs in models or service objects, not controllers. Use \`FactoryBot.define\` for test data, never fixtures. Write request specs for API endpoints and model specs for validations and business logic. Always use strong parameters (\`params.require(:model).permit(:field1, :field2)\`) — never pass raw params to create/update. Generate migrations with \`rails generate migration\` and always make them reversible (\`change\` method, not separate \`up\`/\`down\` unless necessary). Use scopes for reusable queries. Run \`bundle exec rubocop -a\` to auto-fix style issues before pushing.`,
    reviewGuidance: `Rails-specific: check for N+1 queries — if a controller action loads a collection and the view/serializer accesses an association, verify \`.includes()\` or \`.preload()\` is used. Look for mass assignment vulnerabilities: every controller must use strong parameters, and \`params.permit!\` is banned. Verify migrations are reversible — a \`change\` method that can't be auto-reversed (like \`remove_column\` without a type) will break rollbacks. Check for missing model validations: if a column has a NOT NULL constraint in the migration, the model should have \`validates :field, presence: true\`. Look for raw SQL — it's usually a sign of missing scopes or associations. Verify rspec tests use \`let\` and \`subject\` idiomatically, not instance variables in before blocks.`,
    reviewFocus:
      "N+1 queries, missing validations, mass assignment vulnerabilities, reversible migrations, rubocop violations",
    docStyle: "YARD",
    hasDocs: false,
    hasReviewBots: false,
    reviewBotNames: "",
    hasMergeQueue: false,
    mergeCommand: "gh pr merge --squash",
    designNotes:
      "No docs state. Rails-specific: review checks for N+1 queries, mass assignment, reversible migrations. Prompts reference rubocop, rspec with FactoryBot. Code prompt includes rails generate migration for schema changes.",
  },
  {
    language: "csharp",
    description: "C# .NET API with dotnet format, xUnit, GitHub Actions, has docs, no merge queue",
    repoExample: "acme/payments-api — C# .NET 8",
    ciGateCommand: "dotnet format --verify-no-changes && dotnet build --no-restore && dotnet test --no-build",
    ciGateTimeout: 600000,
    conventions: `- .NET 8 minimal APIs or controller-based
- dotnet format enforced (editorconfig rules)
- xUnit with FluentAssertions
- Dependency injection via built-in DI container
- Nullable reference types enabled (no null warnings)
- If adding packages: dotnet add package <name>`,
    specGuidance: `Study the .NET project structure — look at Program.cs or Startup.cs for DI registration and middleware pipeline ordering. Understand the existing service registration: are services registered as Scoped, Transient, or Singleton? Your spec must include full C# method signatures with nullable reference type annotations (\`string?\` vs \`string\`). Pay attention to the async pipeline — if the codebase uses \`async Task<T>\` methods consistently, never introduce synchronous I/O. Check whether the project uses minimal APIs (\`app.MapGet\`) or controller-based routing — new endpoints must follow the existing pattern. If Entity Framework Core is used, understand the DbContext lifetime (scoped) and migration strategy.`,
    codeGuidance: `Write idiomatic C# with .NET 8 conventions. Use nullable reference types everywhere — the project has \`<Nullable>enable</Nullable>\`, so \`string\` means non-null and \`string?\` means nullable. Register services in DI with appropriate lifetimes: Scoped for per-request, Singleton for stateless/thread-safe, Transient for lightweight throwaway. Write tests with xUnit (\`[Fact]\`, \`[Theory]\`) and FluentAssertions (\`result.Should().Be(...)\`). Use \`async/await\` for all I/O — never block with \`.Result\` or \`.Wait()\`. Use records for immutable DTOs (\`record CreateOrderRequest(string Name, int Quantity);\`). Run \`dotnet format\` before pushing — editorconfig rules are enforced.`,
    reviewGuidance: `C#/.NET-specific: check for sync-over-async (\`.Result\`, \`.Wait()\`, \`.GetAwaiter().GetResult()\`) — these cause thread pool starvation under load and are extremely dangerous in ASP.NET. Verify DI lifetimes: a Singleton that depends on a Scoped service is a captive dependency bug — the scoped service never gets disposed. Look for missing null checks on nullable reference types — the compiler warns, but \`!\` (null-forgiving operator) suppresses warnings and should be flagged. Verify that \`async\` methods actually await something — \`async\` without \`await\` is a code smell. Check for missing \`[FromBody]\`/\`[FromQuery]\` attributes on controller parameters. Ensure EF Core queries use \`.AsNoTracking()\` for read-only scenarios.`,
    reviewFocus:
      "null reference warnings, missing async/await (sync-over-async), DI lifetime issues (scoped vs singleton), missing input validation",
    docStyle: "XML doc comments on public APIs, docs/ directory",
    hasDocs: true,
    hasReviewBots: false,
    reviewBotNames: "",
    hasMergeQueue: false,
    mergeCommand: "gh pr merge --squash",
    designNotes:
      "Kept docs state — has docs/. Prompts reference dotnet format, xUnit, FluentAssertions. Review checks for null reference issues, async anti-patterns, DI lifetime bugs. CI timeout 10 min.",
  },
  {
    language: "swift",
    description: "Swift iOS app with SwiftLint, XCTest, GitHub Actions, no docs, no merge queue",
    repoExample: "acme/ios-app — Swift iOS",
    ciGateCommand:
      "swiftlint lint --strict && xcodebuild test -scheme App -destination 'platform=iOS Simulator,name=iPhone 16'",
    ciGateTimeout: 900000,
    conventions: `- SwiftLint enforced (strict mode)
- Swift concurrency (async/await, actors) preferred over GCD
- MVVM architecture
- XCTest for unit tests, XCUITest for UI tests
- Swift Package Manager for dependencies`,
    specGuidance: `Study the Xcode project structure — look at the app's module boundaries, which targets exist (app, tests, UI tests, extensions), and how dependencies flow between them. Understand the existing architecture: is it MVVM with ObservableObject, or does it use the newer @Observable macro? Your spec must include full Swift type signatures with appropriate access control (public, internal, private). Pay attention to concurrency: if the codebase uses Swift concurrency (async/await, actors), new code must not introduce GCD (DispatchQueue) patterns. Check whether SwiftUI views compose from smaller view components or use monolithic view bodies — follow the existing decomposition style.`,
    codeGuidance: `Write idiomatic Swift with modern concurrency. Use async/await and actors for concurrent code — never introduce new DispatchQueue usage. Mark view models as @Observable (Swift 5.9+) or @MainActor ObservableObject for older targets. Use value types (struct, enum) by default; only use class when you need reference semantics or inheritance. Write tests with XCTest — use \`XCTAssertEqual\`, \`XCTAssertThrowsError\`, and \`XCTAssertNil\` with descriptive messages. For async tests, use \`async throws\` test methods. Declare dependencies in Package.swift and use \`swift package resolve\` if needed. Run \`swiftlint lint --strict\` locally before pushing — any warning is a build failure in CI.`,
    reviewGuidance: `Swift-specific: check for retain cycles in closures — any closure that captures \`self\` on a class type needs \`[weak self]\` or \`[unowned self]\`. Look for force unwraps (\`!\`) outside of test code — they crash at runtime and should be replaced with \`guard let\` or \`if let\`. Verify @MainActor annotations: any code that touches UIKit/SwiftUI views must run on the main actor, and the compiler doesn't always catch violations at the boundary. Check for @Sendable compliance — closures passed across actor boundaries must be Sendable, and mutable captured state will cause concurrency warnings in Swift 6 mode. Look for missing access control — internal is the default, but types that shouldn't be public API surface must be explicitly \`private\` or \`fileprivate\`.`,
    reviewFocus:
      "retain cycles (weak/unowned), main thread violations, force unwraps, missing error handling, concurrency safety (@Sendable)",
    docStyle: "Swift documentation comments (///)",
    hasDocs: false,
    hasReviewBots: false,
    reviewBotNames: "",
    hasMergeQueue: false,
    mergeCommand: "gh pr merge --squash",
    designNotes:
      "No docs state. Swift-specific: review checks for retain cycles, main thread violations, force unwraps. CI timeout 15 min — Xcode builds are slow. SwiftLint strict mode. Prompts emphasize async/await over GCD, MVVM pattern.",
  },
  {
    language: "php",
    description: "PHP Laravel app with PHP CS Fixer, PHPUnit, GitHub Actions, no docs, no merge queue",
    repoExample: "acme/store-api — PHP Laravel",
    ciGateCommand: "php-cs-fixer fix --dry-run --diff && php artisan test --parallel",
    ciGateTimeout: 480000,
    conventions: `- Laravel conventions (Eloquent, service classes, form requests)
- PHP CS Fixer for code style (PSR-12)
- PHPUnit with Laravel test helpers
- Migrations via php artisan make:migration
- Type declarations on all method signatures (PHP 8.2+)`,
    specGuidance: `Study the Laravel application structure — look at routes/api.php and routes/web.php for the API surface, app/Models/ for Eloquent models and relationships, and app/Http/Controllers/ for request handling. Understand the existing patterns: does the codebase use Form Requests for validation, or inline validation in controllers? Are there service classes in app/Services/, or does business logic live in models? Your spec must describe Eloquent relationships (hasMany, belongsTo, morphTo) and which migrations are needed. Check config/ for environment-dependent values — new features should use config() helpers, not env() directly outside config files.`,
    codeGuidance: `Write idiomatic Laravel PHP 8.2+. Use type declarations on all method parameters and return types — never rely on docblocks alone for type information. Define validation in Form Request classes (\`php artisan make:request\`), not inline in controllers. Use Eloquent relationships and scopes instead of raw DB queries. Write tests using Laravel's built-in test helpers: \`$this->getJson()\`, \`$this->assertDatabaseHas()\`, \`$this->actingAs()\`. Use \`php artisan make:migration\` for schema changes and always include both \`up()\` and \`down()\` methods. Run \`php-cs-fixer fix --dry-run --diff\` locally to check formatting before pushing. Use \`--parallel\` on \`php artisan test\` for faster test runs.`,
    reviewGuidance: `PHP/Laravel-specific: check for SQL injection — any use of \`DB::raw()\`, \`whereRaw()\`, or string interpolation in queries must use parameter binding. Verify that \`$fillable\` or \`$guarded\` is set on every Eloquent model — missing mass assignment protection is a critical security vulnerability. Look for N+1 queries: if a controller loads a collection and accesses relationships in a loop or blade template, verify \`->with()\` eager loading is used. Check for missing Form Request validation — controllers should never trust input without validation. Verify that migrations have a working \`down()\` method for rollbacks. Look for \`env()\` calls outside of config files — they return null when config is cached, which breaks production deployments.`,
    reviewFocus:
      "SQL injection (raw queries), mass assignment (missing $fillable/$guarded), N+1 queries, missing form request validation, untyped returns",
    docStyle: "PHPDoc",
    hasDocs: false,
    hasReviewBots: false,
    reviewBotNames: "",
    hasMergeQueue: false,
    mergeCommand: "gh pr merge --squash",
    designNotes:
      "No docs state. Laravel-specific: review checks for mass assignment, N+1 queries, SQL injection on raw queries. Prompts reference php-cs-fixer (PSR-12), PHPUnit, Eloquent. CI timeout 8 min.",
  },
  {
    language: "kotlin",
    description: "Kotlin Spring Boot API with ktlint, Kotest, Gradle, GitHub Actions, no docs, no merge queue",
    repoExample: "acme/catalog-api — Kotlin Spring Boot",
    ciGateCommand: "./gradlew ktlintCheck && ./gradlew test && ./gradlew build",
    ciGateTimeout: 900000,
    conventions: `- Kotlin idioms (data classes, sealed classes, extension functions)
- Spring Boot 3 with constructor injection
- Kotest with BehaviorSpec style
- ktlint enforced via Gradle plugin
- Coroutines for async operations (not CompletableFuture)`,
    specGuidance: `Study the Kotlin project structure — look for the Application.kt or main entry point to understand Spring Boot configuration, and check the package layout for how domains are organized. Understand the Kotlin idioms already in use: does the codebase use sealed classes for domain results, data classes for DTOs, and extension functions for utility? Your spec must include full Kotlin type signatures with nullability annotations — \`String\` vs \`String?\` matters. Pay attention to coroutine usage: are suspend functions used throughout, or is there a mix with blocking calls? If the project uses Spring WebFlux, the entire chain must be non-blocking. Check for existing DSL patterns (Kotest, Exposed, Ktor) — new code should use the same style.`,
    codeGuidance: `Write idiomatic Kotlin. Use data classes for DTOs and value objects, sealed classes for result types (\`sealed class Result<T>\`), and extension functions to extend existing types cleanly. Prefer \`val\` over \`var\` everywhere — mutability should be exceptional and justified. Use coroutines (\`suspend fun\`, \`withContext\`, \`Flow\`) for async operations — never use CompletableFuture or blocking calls in a coroutine context. Write tests with Kotest using BehaviorSpec style: \`Given("a user") { When("they log in") { Then("they get a token") { ... } } }\`. Use \`./gradlew ktlintCheck\` to verify code style before pushing. Leverage Kotlin's null safety — use \`?.\`, \`?:\`, and \`let {}\` instead of null checks.`,
    reviewGuidance: `Kotlin-specific: check for platform types from Java interop — when calling Java APIs that lack nullability annotations, Kotlin treats the return as a "platform type" (\`String!\`) which bypasses null safety. These must be explicitly annotated as nullable (\`String?\`) or non-null (\`String\`) at the call site. Look for blocking calls inside coroutine scopes — \`Thread.sleep()\`, synchronous I/O, or JDBC calls in a coroutine context will block the dispatcher and starve other coroutines. Use \`withContext(Dispatchers.IO)\` for blocking operations. Verify that \`var\` usage is justified — \`val\` should be the default. Check for unnecessary \`!!\` (not-null assertion) — it's a crash waiting to happen and usually means the nullability design is wrong.`,
    reviewFocus:
      "platform type usage (missing nullability annotations on Java interop), blocking calls in coroutine context, unnecessary mutability (var vs val)",
    docStyle: "KDoc",
    hasDocs: false,
    hasReviewBots: false,
    reviewBotNames: "",
    hasMergeQueue: false,
    mergeCommand: "gh pr merge --squash",
    designNotes:
      "No docs state. Kotlin-specific: review checks for platform types, blocking-in-coroutines, var-vs-val. Prompts reference ktlint, Kotest BehaviorSpec, coroutines. CI timeout 15 min for Gradle.",
  },
  {
    language: "elixir",
    description: "Elixir Phoenix app with mix format, ExUnit, GitHub Actions, has docs, no merge queue",
    repoExample: "acme/realtime-api — Elixir Phoenix",
    ciGateCommand: "mix format --check-formatted && mix credo --strict && mix test",
    ciGateTimeout: 480000,
    conventions: `- Phoenix conventions (contexts, schemas, changesets)
- mix format enforced
- Credo for static analysis (strict mode)
- ExUnit with setup/setup_all blocks
- Pattern matching preferred over conditionals
- Pipe operator for data transformations`,
    specGuidance: `Study the Phoenix application structure — look at lib/app_web/ for controllers, channels, and live views, and lib/app/ for contexts (business logic modules). Understand how contexts are organized: Phoenix uses "contexts" as bounded domain modules (e.g., Accounts, Catalog) — new features should live in the appropriate context or define a new one. Your spec must describe which context owns the new functionality, what Ecto schemas and changesets are needed, and how data flows through the pipeline. Pay attention to process architecture: does the app use GenServers, Supervisors, or Task.async for background work? New concurrent code must fit into the existing supervision tree.`,
    codeGuidance: `Write idiomatic Elixir. Use pattern matching in function heads instead of conditionals — define multiple function clauses for different cases. Use the pipe operator (\`|>\`) for data transformation chains. Return tagged tuples (\`{:ok, result}\` / \`{:error, reason}\`) from all fallible functions — never raise exceptions for expected failures. Write Ecto changesets for all data validation — don't validate in controllers. Structure tests with ExUnit: use \`setup\` blocks for test fixtures, \`describe\` blocks to group related tests, and \`assert/refute\` for assertions. Add \`@moduledoc\` to every module and \`@doc\` to every public function — Credo strict mode enforces documentation. Run \`mix format\` before committing — it's deterministic and non-negotiable.`,
    reviewGuidance: `Elixir-specific: check for unsupervised processes — any \`spawn\`, \`Task.start\`, or \`GenServer.start\` without supervision is a process leak waiting to happen. All long-lived processes must be part of a supervision tree. Verify that all public functions return tagged tuples (\`{:ok, _}\` / \`{:error, _}\`) — bare returns from functions that can fail make error handling impossible for callers. Look for missing typespec (\`@spec\`) on public functions — Credo strict mode and Dialyzer expect these. Check Ecto changesets for validation completeness: if a migration adds a NOT NULL column, the changeset must validate presence. Verify that pattern matching is exhaustive — missing clauses cause \`FunctionClauseError\` at runtime. Check for missing \`@moduledoc false\` on internal helper modules — without it, ExDoc generates empty documentation pages.`,
    reviewFocus:
      "process leaks (unsupervised processes), missing error tuples ({:ok, _}/{:error, _}), changeset validation gaps, missing typespec",
    docStyle: "@moduledoc and @doc with ExDoc",
    hasDocs: true,
    hasReviewBots: false,
    reviewBotNames: "",
    hasMergeQueue: false,
    mergeCommand: "gh pr merge --squash",
    designNotes:
      "Kept docs state — Elixir has strong ExDoc culture. Review checks for process leaks, missing error tuples, changeset gaps. Prompts reference mix format, Credo strict, ExUnit. CI timeout 8 min.",
  },
  {
    language: "cpp",
    description: "C++ library with clang-tidy, Google Test, CMake, GitHub Actions, no docs, no merge queue",
    repoExample: "acme/core-lib — C++ library",
    ciGateCommand:
      "cmake --build build && cd build && ctest --output-on-failure && cd .. && clang-tidy -p build src/**/*.cpp",
    ciGateTimeout: 900000,
    conventions: `- Modern C++ (C++20, RAII, smart pointers)
- CMake build system
- Google Test / Google Mock for testing
- clang-tidy for static analysis
- No raw new/delete — use std::unique_ptr/std::shared_ptr
- Header-only where possible for library code`,
    specGuidance: `Study the CMake project structure — look at the top-level CMakeLists.txt for targets, dependencies, and compile options, and check src/ and include/ for the header/source split. Understand the library's public API surface: which headers are in include/ (installed/public) vs src/ (private implementation)? Your spec must describe which compilation units are affected, what headers to add/modify, and how the new code fits into the existing target dependency graph. Pay attention to template vs non-template code boundaries — heavy template code in headers increases compile times. If the project uses namespaces, new code must be in the correct namespace. Consider ABI compatibility if this is a shared library.`,
    codeGuidance: `Write modern C++20. Use RAII for all resource management — std::unique_ptr for exclusive ownership, std::shared_ptr only when ownership is genuinely shared. Use std::string_view for non-owning string parameters, std::span for non-owning array views. Write tests with Google Test: \`TEST(SuiteName, TestName) { EXPECT_EQ(actual, expected); }\` and Google Mock for dependency mocking. Use \`constexpr\` where possible to push computation to compile time. Mark functions \`[[nodiscard]]\` if ignoring the return value is always a bug. Use structured bindings (\`auto [key, value] = ...\`) for readability. Include what you use — don't rely on transitive includes. Run \`clang-tidy -p build\` to catch anti-patterns before pushing.`,
    reviewGuidance: `C++-specific: check for raw \`new\`/\`delete\` — these must be replaced with smart pointers (std::unique_ptr/std::make_unique). Look for undefined behavior: signed integer overflow, use-after-move, dangling references from returning references to locals, and iterator invalidation. Verify const-correctness: methods that don't mutate state must be \`const\`, parameters passed by reference that aren't modified must be \`const&\`. Check include hygiene — every file should include only what it directly uses, not rely on transitive includes (use include-what-you-use as a guide). Look for thread safety issues: shared mutable state without std::mutex or std::atomic is a data race. Verify that move constructors and move assignment operators are noexcept — STL containers only use move semantics if the move operations are noexcept.`,
    reviewFocus:
      "memory safety (raw pointers, manual new/delete), undefined behavior, missing const-correctness, include hygiene, thread safety",
    docStyle: "Doxygen",
    hasDocs: false,
    hasReviewBots: false,
    reviewBotNames: "",
    hasMergeQueue: false,
    mergeCommand: "gh pr merge --squash",
    designNotes:
      "No docs state. C++-specific: review focuses on memory safety, undefined behavior, const-correctness. CI timeout 15 min — C++ builds are slow. Prompts emphasize RAII, smart pointers, modern C++20.",
  },
  {
    language: "dart",
    description: "Dart Flutter app with dart analyze, flutter test, GitHub Actions, no docs, no merge queue",
    repoExample: "acme/mobile-app — Dart Flutter",
    ciGateCommand: "dart analyze --fatal-infos && flutter test --coverage",
    ciGateTimeout: 600000,
    conventions: `- Flutter/Dart conventions (Widget composition, BLoC or Riverpod for state)
- dart analyze with fatal-infos (zero warnings)
- flutter test for widget and unit tests
- Effective Dart style guide
- Immutable state objects
- If adding packages: flutter pub add <name>`,
    specGuidance: `Study the Flutter project structure — look at lib/ for the app source, lib/main.dart for the widget tree root, and how screens/pages are organized (by feature or by layer). Understand the state management approach: is the codebase using BLoC (with flutter_bloc), Riverpod, Provider, or GetX? New features must use the same state management pattern. Your spec must describe new Widget classes, their state management needs, and how they compose into the existing navigation structure. Pay attention to platform channels: if the app uses MethodChannels for native platform features, specify which platform calls are needed. Check for existing theme and design system usage — new widgets should use Theme.of(context) and existing design tokens, not hardcoded values.`,
    codeGuidance: `Write idiomatic Dart with Flutter conventions. Compose UIs from small, focused widgets — extract any widget subtree that exceeds ~50 lines into its own widget class. Use \`const\` constructors wherever possible to enable Flutter's widget rebuild optimization. Manage state through the project's chosen pattern (BLoC, Riverpod, etc.) — never use setState in anything but the simplest ephemeral UI state (animations, form fields). Write widget tests with \`testWidgets\` and \`pumpWidget\`, unit tests with the standard \`test\` package. Use \`flutter pub add\` to add dependencies and verify they support all target platforms. Mark classes and members as \`final\` by default — immutability prevents entire categories of state bugs. Run \`dart analyze --fatal-infos\` before pushing — zero warnings or infos are tolerated.`,
    reviewGuidance: `Dart/Flutter-specific: check for unnecessary widget rebuilds — if a StatefulWidget calls \`setState\` at the root level, the entire subtree rebuilds. Verify that \`const\` constructors are used wherever possible — they allow Flutter to skip rebuilding unchanged widgets. Look for state management leaks: BLoC streams or Riverpod providers that aren't properly disposed when a widget unmounts cause memory leaks. Check for missing null safety — Dart's sound null safety means \`String\` is non-nullable, but the \`!\` operator bypasses this and crashes at runtime. Verify platform-specific code is abstracted behind a service interface — \`dart:io\` imports in widget code break web targets. Look for hardcoded strings that should use localization, and hardcoded colors/sizes that should come from the theme.`,
    reviewFocus:
      "widget rebuild efficiency (unnecessary setState/build), state management leaks, missing null safety, platform-specific code without abstraction",
    docStyle: "dartdoc (///)",
    hasDocs: false,
    hasReviewBots: false,
    reviewBotNames: "",
    hasMergeQueue: false,
    mergeCommand: "gh pr merge --squash",
    designNotes:
      "No docs state. Flutter-specific: review checks for unnecessary rebuilds, state management leaks. Prompts reference dart analyze (fatal-infos), flutter test. CI timeout 10 min.",
  },
];

// ─── Build examples from real prompts + adaptations ───

function buildExample(a: LanguageAdaptation): FlowDesignExample {
  const specPrompt = `You are an architect. Read the codebase, analyze the issue, and write a detailed implementation spec.

## Issue
#{{entity.artifacts.issueNumber}}: {{entity.artifacts.issueTitle}}

{{entity.artifacts.issueBody}}

## Repo
${a.repoExample}

## Conventions
${a.conventions}

## Reading This Codebase
${a.specGuidance}

## Instructions
1. Read the codebase thoroughly. Understand existing patterns, conventions, and architecture.
2. Identify which files to create, modify, or delete.
3. Specify function signatures, data structures, and test cases.
4. Post the spec as a comment on the issue starting with "## Implementation Spec".
5. When done, output the following signal on a line by itself with no other text:

spec_ready`;

  const codePrompt = `You are a software engineer. Implement the architect's spec, create a PR, and signal when ready for review.

## Issue
#{{entity.artifacts.issueNumber}}: {{entity.artifacts.issueTitle}}

## Architect's Spec
{{entity.artifacts.architectSpec}}

{{#if entity.artifacts.gate_failures}}
## Prior Gate Failures — Fix These First
{{#each entity.artifacts.gate_failures}}
- Gate: {{this.gateName}} — {{this.output}}
{{/each}}
{{/if}}

## CI Gate — Run Before Pushing
${a.ciGateCommand}

## Writing Code For This Repo
${a.codeGuidance}

## Instructions
1. Follow the architect's spec closely.
2. Write clean, tested code following the guidance above.
3. Create a pull request with a clear description.
4. Run the CI gate locally before pushing. All steps must pass.
5. When done, output the following signal on a line by itself with no other text:

pr_created

Include the PR URL in your response.`;

  const reviewBotLine = a.hasReviewBots
    ? `2. Check every ${a.reviewBotNames} comment on the PR — address or acknowledge each one.\n`
    : "2. Check every automated review bot comment (CodeRabbit, Sourcery, etc.) if any are present.\n";

  const reviewPrompt = `You are a code reviewer. Check the PR for correctness, security, and quality.

## PR
{{entity.artifacts.prUrl}} (#{{entity.artifacts.prNumber}})

## Issue
#{{entity.artifacts.issueNumber}}: {{entity.artifacts.issueTitle}}

## Architect's Spec
{{entity.artifacts.architectSpec}}

## What To Look For In This Repo
${a.reviewGuidance}

## Instructions
1. Read the full PR diff.
${reviewBotLine}3. Verify CI is green.
4. Check for: bugs, security issues, missing tests, spec violations, dead code, ${a.reviewFocus}.
5. When done, output ONE of the following signals on a line by itself with no other text:

clean

If there are issues, list every finding with file, line, and description, then output:

issues

If CI failed, output:

ci_failed`;

  const fixPrompt = `You are a software engineer. Fix every issue found during review, push the fixes, and signal ready for re-review.

## PR
{{entity.artifacts.prUrl}} (#{{entity.artifacts.prNumber}})

{{#if entity.artifacts.reviewFindings}}
## Review Findings — Fix All of These
{{entity.artifacts.reviewFindings}}
{{/if}}

{{#if entity.artifacts.gate_failures}}
## Gate Failures
{{#each entity.artifacts.gate_failures}}
- {{this.gateName}}: {{this.output}}
{{/each}}
{{/if}}

## CI Gate — Run Before Pushing
${a.ciGateCommand}

## Instructions
1. Fix every finding. Do not skip any.
2. Run the CI gate locally before pushing. All steps must pass.
3. Push to the same branch.
4. When done, output the following signal on a line by itself with no other text:

fixes_pushed

If a finding contradicts the architect's spec, output instead:

cant_resolve`;

  const docsPrompt = `You are a technical writer. Update documentation to reflect the changes in this PR.

## PR
{{entity.artifacts.prUrl}} (#{{entity.artifacts.prNumber}})

## Architect's Spec
{{entity.artifacts.architectSpec}}

## Instructions
1. Read the PR diff and spec.
2. Update or create documentation (README, docs/, ${a.docStyle}, comments).
3. Push doc updates to the same branch. Do NOT create a new PR.
4. When done, output the following signal on a line by itself with no other text:

docs_ready

If you can't complete documentation, output instead:

cant_document`;

  const learningPrompt = `You are a learning agent. Extract patterns and update project memory from this completed work.

## Issue
#{{entity.artifacts.issueNumber}}: {{entity.artifacts.issueTitle}}

## What Happened
- Spec: {{entity.artifacts.architectSpec}}
- PR: {{entity.artifacts.prUrl}}

## Instructions
1. What patterns or conventions did this work establish or reinforce?
2. Were there any surprising findings during review?
3. Update CLAUDE.md or project docs if new conventions were established.
4. When done, output the following signal on a line by itself with no other text:

learned`;

  const mergePrompt = a.hasMergeQueue
    ? `You are a merge agent. Merge the PR via the merge queue.

## PR
{{entity.artifacts.prUrl}} (#{{entity.artifacts.prNumber}})

## Instructions
1. Verify the PR is mergeable (no conflicts, CI green, reviews approved).
2. Add the PR to the merge queue: ${a.mergeCommand}
3. If the merge queue rejects (DIRTY status), rebase and force-push, then re-enqueue.
4. When done, output ONE of the following signals on a line by itself with no other text:

merged

If blocked (merge queue rejected, conflicts), output:

blocked

If PR was closed without merge, output:

closed`
    : `You are a merge agent. Merge the PR.

## PR
{{entity.artifacts.prUrl}} (#{{entity.artifacts.prNumber}})

## Instructions
1. Verify the PR is mergeable (no conflicts, CI green, reviews approved).
2. Merge the PR: ${a.mergeCommand}
3. When done, output ONE of the following signals on a line by itself with no other text:

merged

If blocked (conflicts, failing checks), output:

blocked

If PR was closed without merge, output:

closed`;

  // Build states array
  const states: Record<string, unknown>[] = [
    { name: "spec", agentRole: "architect", modelTier: "sonnet", mode: "active", promptTemplate: specPrompt },
    { name: "code", agentRole: "coder", modelTier: "sonnet", mode: "active", promptTemplate: codePrompt },
    { name: "review", agentRole: "reviewer", modelTier: "sonnet", mode: "active", promptTemplate: reviewPrompt },
    { name: "fix", agentRole: "fixer", modelTier: "sonnet", mode: "active", promptTemplate: fixPrompt },
  ];

  if (a.hasDocs) {
    states.push({
      name: "docs",
      agentRole: "technical-writer",
      modelTier: "sonnet",
      mode: "active",
      promptTemplate: docsPrompt,
    });
  }

  states.push(
    { name: "learning", agentRole: "learner", modelTier: "haiku", mode: "active", promptTemplate: learningPrompt },
    { name: "merge", agentRole: "merger", modelTier: "haiku", mode: "active", promptTemplate: mergePrompt },
    { name: "done", mode: "passive" },
    { name: "stuck", mode: "passive" },
    { name: "cancelled", mode: "passive" },
    { name: "budget_exceeded", mode: "passive" },
  );

  // Build transitions
  const transitions: Record<string, unknown>[] = [
    { fromState: "spec", toState: "code", trigger: "spec_ready", priority: 0 },
    { fromState: "code", toState: "review", trigger: "pr_created", priority: 0 },
  ];

  if (a.hasDocs) {
    transitions.push(
      { fromState: "review", toState: "docs", trigger: "clean", priority: 0 },
      { fromState: "review", toState: "fix", trigger: "issues", priority: 0 },
      { fromState: "review", toState: "fix", trigger: "ci_failed", priority: 0 },
      { fromState: "fix", toState: "review", trigger: "fixes_pushed", priority: 0 },
      { fromState: "fix", toState: "stuck", trigger: "cant_resolve", priority: 0 },
      { fromState: "docs", toState: "learning", trigger: "docs_ready", priority: 0 },
      { fromState: "docs", toState: "stuck", trigger: "cant_document", priority: 0 },
    );
  } else {
    transitions.push(
      { fromState: "review", toState: "learning", trigger: "clean", priority: 0 },
      { fromState: "review", toState: "fix", trigger: "issues", priority: 0 },
      { fromState: "review", toState: "fix", trigger: "ci_failed", priority: 0 },
      { fromState: "fix", toState: "review", trigger: "fixes_pushed", priority: 0 },
      { fromState: "fix", toState: "stuck", trigger: "cant_resolve", priority: 0 },
    );
  }

  transitions.push(
    { fromState: "learning", toState: "merge", trigger: "learned", priority: 0 },
    { fromState: "merge", toState: "done", trigger: "merged", priority: 0 },
    { fromState: "merge", toState: "fix", trigger: "blocked", priority: 0 },
    { fromState: "merge", toState: "stuck", trigger: "closed", priority: 0 },
  );

  // Build gates
  const gates = [
    {
      name: "spec-posted",
      type: "primitive",
      primitiveOp: "issue_tracker.comment_exists",
      primitiveParams: { issueNumber: "{{entity.artifacts.issueNumber}}", pattern: "## Implementation Spec" },
      timeoutMs: 120000,
      failurePrompt: `The spec gate checked for a comment starting with "## Implementation Spec" on issue #{{entity.artifacts.issueNumber}} and did not find one. Post the spec as a comment on the issue. The comment MUST start with the exact heading "## Implementation Spec".`,
      timeoutPrompt: "The spec gate timed out after 2 minutes. The GitHub API may be slow. Try posting the spec again.",
    },
    {
      name: "ci-green",
      type: "primitive",
      primitiveOp: "vcs.ci_status",
      primitiveParams: { ref: "{{entity.artifacts.headSha}}" },
      timeoutMs: a.ciGateTimeout,
      failurePrompt: `CI checks failed on PR #{{entity.artifacts.prNumber}}. Check the failing runs, fix the issues, and push again. The CI gate for this repo is: ${a.ciGateCommand}`,
      timeoutPrompt: `CI checks are still running after ${Math.round(a.ciGateTimeout / 60000)} minutes. They may be queued or slow. The pipeline will retry.`,
      outcomes: { passed: { proceed: true }, pending: { toState: "review" }, failed: { toState: "fix" } },
    },
    {
      name: "pr-mergeable",
      type: "primitive",
      primitiveOp: "vcs.pr_status",
      primitiveParams: { pullNumber: "{{entity.artifacts.prNumber}}" },
      timeoutMs: 120000,
      failurePrompt:
        "PR #{{entity.artifacts.prNumber}} is not mergeable. Check for conflicts or failing required checks.",
      outcomes: {
        merged: { proceed: true },
        mergeable: { proceed: true },
        blocked: { toState: "fix" },
        closed: { toState: "stuck" },
      },
    },
  ];

  const gateWiring: Record<string, { fromState: string; trigger: string }> = {
    "spec-posted": { fromState: "spec", trigger: "spec_ready" },
    "ci-green": { fromState: "code", trigger: "pr_created" },
    "pr-mergeable": { fromState: "merge", trigger: "merged" },
  };

  const flow = {
    name: "engineering",
    description: `Engineering flow for ${a.repoExample}. ${a.description}.`,
    initialState: "spec",
    maxConcurrent: 4,
    maxConcurrentPerRepo: 2,
    affinityWindowMs: 300000,
    claimRetryAfterMs: 30000,
    gateTimeoutMs: 120000,
    defaultModelTier: "sonnet",
    maxInvocationsPerEntity: 50,
  };

  const designJson = JSON.stringify({ flow, states, gates, transitions, gateWiring });

  return {
    language: a.language,
    description: a.description,
    output: `FLOW_DESIGN:${designJson}\nDESIGN_NOTES:${a.designNotes}`,
  };
}

export const EXAMPLES: FlowDesignExample[] = ADAPTATIONS.map(buildExample);
