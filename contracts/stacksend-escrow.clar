;; StackSend Escrow Contract
;; A peer-to-peer remittance smart contract with group contribution support
;; Built with Clarity 4 for Stacks blockchain

;; Constants
(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u100))
(define-constant err-not-found (err u101))
(define-constant err-unauthorized (err u102))
(define-constant err-invalid-amount (err u103))
(define-constant err-invalid-deadline (err u104))
(define-constant err-target-not-reached (err u105))
(define-constant err-already-released (err u106))
(define-constant err-deadline-passed (err u107))
(define-constant err-invalid-status (err u108))
(define-constant err-contract-paused (err u109))
(define-constant err-invalid-recipient (err u110))

;; Platform fee: 0.5% (50 basis points out of 10000)
;; Max fee: 5% (500 basis points)
(define-constant basis-points u10000)
(define-constant max-platform-fee-bps u500)
(define-data-var platform-fee-bps uint u50)

;; Data Variables
(define-data-var remittance-nonce uint u0)
(define-data-var contract-paused bool false)

;; Data Maps
;; Remittance structure
(define-map remittances
  { remittance-id: uint }
  {
    creator: principal,
    recipient: principal,
    target-amount: uint,
    total-raised: uint,
    deadline: uint,
    description: (string-ascii 500),
    status: (string-ascii 20),
    created-at: uint,
    released-at: (optional uint),
    currency-pair: (string-ascii 10)
  }
)

;; Contribution tracking
(define-map contributions
  { remittance-id: uint, contributor: principal }
  {
    amount: uint,
    contributed-at: uint
  }
)

;; Track list of contributors per remittance (for refunds)
(define-map remittance-contributors
  { remittance-id: uint }
  { contributors: (list 100 principal) }
)

;; Public Functions

;; Create a new remittance request
;; @param recipient: The principal who will receive the funds
;; @param target-amount: The total amount needed (in micro-STX)
;; @param deadline: Block time when the remittance expires
;; @param description: Description of the remittance purpose
;; @param currency-pair: Currency pair for exchange rate (e.g., "USD-KES")
;; @returns: The remittance ID on success, error code on failure
(define-public (create-remittance
    (recipient principal)
    (target-amount uint)
    (deadline uint)
    (description (string-ascii 500))
    (currency-pair (string-ascii 10)))
  (let
    (
      (remittance-id (var-get remittance-nonce))
      (current-time (unwrap-panic (stacks-block-time)))
    )

    ;; Validations
    (asserts! (not (var-get contract-paused)) err-contract-paused)
    (try! (validate-principal recipient false))
    (asserts! (> target-amount u0) err-invalid-amount)
    (asserts! (> deadline current-time) err-invalid-deadline)

    ;; Store remittance data
    (map-set remittances
      { remittance-id: remittance-id }
      {
        creator: tx-sender,
        recipient: recipient,
        target-amount: target-amount,
        total-raised: u0,
        deadline: deadline,
        description: description,
        status: "active",
        created-at: current-time,
        released-at: none,
        currency-pair: currency-pair
      }
    )

    ;; Increment nonce for next remittance
    (var-set remittance-nonce (+ remittance-id u1))

    ;; Return the remittance ID
    (ok remittance-id)
  )
)

;; Contribute STX to a remittance
;; @param remittance-id: The ID of the remittance to contribute to
;; @param amount: Amount of STX to contribute (in micro-STX)
;; @returns: Success boolean or error code
(define-public (contribute (remittance-id uint) (amount uint))
  (let
    (
      (remittance (unwrap! (map-get? remittances { remittance-id: remittance-id }) err-not-found))
      (current-time (unwrap-panic (stacks-block-time)))
      (existing-contribution (default-to
        { amount: u0, contributed-at: u0 }
        (map-get? contributions { remittance-id: remittance-id, contributor: tx-sender })
      ))
      (new-contribution-amount (+ (get amount existing-contribution) amount))
      (new-total-raised (+ (get total-raised remittance) amount))
      (target-reached (>= new-total-raised (get target-amount remittance)))
    )

    ;; Validations
    (asserts! (not (var-get contract-paused)) err-contract-paused)
    (asserts! (> amount u0) err-invalid-amount)
    (asserts! (is-eq (get status remittance) "active") err-invalid-status)
    (asserts! (> (get deadline remittance) current-time) err-deadline-passed)

    ;; Transfer STX from contributor to contract
    (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))

    ;; Add contributor to list if first-time contributor
    (if (is-eq (get amount existing-contribution) u0)
      (let
        (
          (current-contributors (default-to
            { contributors: (list) }
            (map-get? remittance-contributors { remittance-id: remittance-id })
          ))
        )
        (map-set remittance-contributors
          { remittance-id: remittance-id }
          { contributors: (unwrap-panic (as-max-len? (append (get contributors current-contributors) tx-sender) u100)) }
        )
      )
      true
    )

    ;; Update or create contribution record
    (map-set contributions
      { remittance-id: remittance-id, contributor: tx-sender }
      {
        amount: new-contribution-amount,
        contributed-at: current-time
      }
    )

    ;; Update remittance with new total and status if target reached
    (map-set remittances
      { remittance-id: remittance-id }
      (merge remittance {
        total-raised: new-total-raised,
        status: (if target-reached "funded" "active")
      })
    )

    (ok true)
  )
)

;; Release funds to recipient after target is reached
;; @param remittance-id: The ID of the remittance to release funds from
;; @returns: Success boolean or error code
(define-public (release-funds (remittance-id uint))
  (let
    (
      (remittance (unwrap! (map-get? remittances { remittance-id: remittance-id }) err-not-found))
      (current-time (unwrap-panic (stacks-block-time)))
      (total-raised (get total-raised remittance))
      (platform-fee (/ (* total-raised (var-get platform-fee-bps)) basis-points))
      (net-amount (- total-raised platform-fee))
    )

    ;; Validations
    (asserts! (is-eq tx-sender (get recipient remittance)) err-unauthorized)
    (asserts! (is-eq (get status remittance) "funded") err-invalid-status)

    ;; Transfer net amount to recipient
    (try! (as-contract (stx-transfer? net-amount tx-sender (get recipient remittance))))

    ;; Transfer platform fee to contract owner
    (try! (as-contract (stx-transfer? platform-fee tx-sender contract-owner)))

    ;; Update remittance status and timestamp
    (map-set remittances
      { remittance-id: remittance-id }
      (merge remittance {
        status: "completed",
        released-at: (some current-time)
      })
    )

    (ok true)
  )
)

;; Cancel remittance and refund all contributors
;; @param remittance-id: The ID of the remittance to cancel
;; @returns: Success boolean or error code
(define-public (cancel-remittance (remittance-id uint))
  (let
    (
      (remittance (unwrap! (map-get? remittances { remittance-id: remittance-id }) err-not-found))
      (contributors-data (default-to
        { contributors: (list) }
        (map-get? remittance-contributors { remittance-id: remittance-id })
      ))
      (contributors-list (get contributors contributors-data))
    )

    ;; Validations
    (asserts! (is-eq tx-sender (get creator remittance)) err-unauthorized)
    (asserts! (or
      (is-eq (get status remittance) "active")
      (is-eq (get status remittance) "funded")
    ) err-invalid-status)

    ;; Refund all contributors
    (fold refund-contributor contributors-list { remittance-id: remittance-id, success: true })

    ;; Update remittance status to cancelled
    (map-set remittances
      { remittance-id: remittance-id }
      (merge remittance { status: "cancelled" })
    )

    (ok true)
  )
)

;; Admin Functions

;; Pause the contract (owner only)
;; @returns: Success boolean or error code
(define-public (pause-contract)
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (asserts! (not (var-get contract-paused)) err-contract-paused)
    (var-set contract-paused true)
    (ok true)
  )
)

;; Unpause the contract (owner only)
;; @returns: Success boolean or error code
(define-public (unpause-contract)
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (asserts! (var-get contract-paused) err-invalid-status)
    (var-set contract-paused false)
    (ok true)
  )
)

;; Update platform fee (owner only)
;; @param new-fee-bps: New fee in basis points (max 500 = 5%)
;; @returns: Success boolean or error code
(define-public (update-platform-fee (new-fee-bps uint))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (asserts! (<= new-fee-bps max-platform-fee-bps) err-invalid-amount)
    (var-set platform-fee-bps new-fee-bps)
    (ok true)
  )
)

;; Emergency withdraw for stuck funds (owner only)
;; This should only be used for truly stuck funds, not active remittances
;; @param amount: Amount to withdraw in micro-STX
;; @param recipient: Where to send the funds
;; @returns: Success boolean or error code
(define-public (emergency-withdraw (amount uint) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (asserts! (> amount u0) err-invalid-amount)
    (try! (as-contract (stx-transfer? amount tx-sender recipient)))
    (ok true)
  )
)

;; Private Functions

;; Helper function to validate principal addresses
;; @param principal-to-check: The principal to validate
;; @param allow-self: Whether tx-sender is allowed as the principal
;; @returns: (ok true) if valid, error otherwise
(define-private (validate-principal (principal-to-check principal) (allow-self bool))
  (begin
    ;; Check if principal is tx-sender when not allowed
    (asserts! (or allow-self (not (is-eq principal-to-check tx-sender))) err-invalid-recipient)
    (ok true)
  )
)

;; Helper function to refund a single contributor
;; @param contributor: The principal to refund
;; @param context: Context containing remittance-id and success flag
;; @returns: Updated context
(define-private (refund-contributor
    (contributor principal)
    (context { remittance-id: uint, success: bool }))
  (let
    (
      (remittance-id (get remittance-id context))
      (contribution (unwrap-panic (map-get? contributions { remittance-id: remittance-id, contributor: contributor })))
      (refund-amount (get amount contribution))
    )

    ;; Transfer refund from contract to contributor
    (if (> refund-amount u0)
      (begin
        (unwrap-panic (as-contract (stx-transfer? refund-amount tx-sender contributor)))
        context
      )
      context
    )
  )
)

;; Read-only functions

;; Get contract owner
(define-read-only (get-contract-owner)
  contract-owner
)

;; Check if contract is paused
(define-read-only (is-paused)
  (var-get contract-paused)
)

;; Get remittance details by ID
;; @param remittance-id: The ID of the remittance
;; @returns: Remittance data or error if not found
(define-read-only (get-remittance (remittance-id uint))
  (ok (unwrap! (map-get? remittances { remittance-id: remittance-id }) err-not-found))
)

;; Get contribution details for a specific contributor
;; @param remittance-id: The ID of the remittance
;; @param contributor: The principal of the contributor
;; @returns: Contribution data or error if not found
(define-read-only (get-contribution (remittance-id uint) (contributor principal))
  (ok (unwrap! (map-get? contributions { remittance-id: remittance-id, contributor: contributor }) err-not-found))
)

;; Get current platform fee in basis points
;; @returns: Current platform fee (e.g., 50 = 0.5%)
(define-read-only (get-platform-fee)
  (var-get platform-fee-bps)
)
