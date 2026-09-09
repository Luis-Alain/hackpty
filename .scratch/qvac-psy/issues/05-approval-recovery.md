# Lock the approval and recovery rules
Type: grilling
Status: resolved
Blocked by: 04

## Question
What happens on source correction, duplicate transfer and restart?

## Answer
Approval binds patient, encounter, source revision and exact draft. A source change preserves the old approved record but marks it superseded and requires a fresh draft/review. Only current approved records enter patient history for retrieval; audit versions remain available separately. Pending captures remain recoverable encrypted data. Transfers are authenticated and idempotent by device + transfer id; payload changes under the same id are rejected. Writes use authenticated encryption and atomic replacement. Wrong passphrases fail without modifying the vault.
