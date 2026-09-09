# Freeze the shared component contract
Type: grilling
Status: resolved
Blocked by: none

## Question
What can other challenges reuse without inheriting clinical authority or patient data?

## Answer
User approved the implementation plan and then requested a future RAG connection for previous approved patient notes. Shared runtime accepts images or source text and returns output plus run measurements. Optional retrieval receives patient id, query and cancellation signal; returns note/revision identifiers and excerpt locators. The application checks every hit against its own authorized current approved records and supplies the canonical excerpt. Provider text is never authoritative. RAG is disabled by default. No cloud provider, cross-patient search or external-document corpus is included.
