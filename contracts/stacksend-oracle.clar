;; StackSend Oracle Contract
;; Price feed oracle for exchange rate management
;; Built with Clarity 4 for Stacks blockchain

;; Constants
(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u200))
(define-constant err-not-found (err u201))
(define-constant err-stale-price (err u202))
(define-constant err-invalid-rate (err u203))
(define-constant err-unauthorized (err u204))
(define-constant err-invalid-pair (err u205))

;; Maximum price age: 24 hours (86400 seconds)
(define-constant max-rate-age u86400)

;; Rate bounds: Minimum and maximum reasonable exchange rates
;; Min: 0.000001 (1e-6) represented as 100 with 8 decimals
;; Max: 100000000 (1e8) represented as 10000000000000000 with 8 decimals
(define-constant min-rate u100)
(define-constant max-rate u10000000000000000)

;; Fixed decimals for all rates (8 decimal places)
(define-constant rate-decimals u8)

;; Data Variables
(define-data-var oracle-active bool true)

;; Data Maps

;; Exchange rate storage
(define-map exchange-rates
  { currency-pair: (string-ascii 10) }
  {
    rate: uint,
    updated-at: uint,
    updater: principal
  }
)

;; Authorized updaters who can submit price feeds
(define-map authorized-updaters
  { updater: principal }
  { authorized: bool }
)

;; Public Functions

;; Update exchange rate for a currency pair
;; @param currency-pair: The currency pair (e.g., "USD-KES")
;; @param rate: The exchange rate with 8 decimal precision
;; @returns: Success boolean or error code
(define-public (update-exchange-rate (currency-pair (string-ascii 10)) (rate uint))
  (let
    (
      (current-time (unwrap-panic (stacks-block-time)))
    )

    ;; Validations
    (asserts! (var-get oracle-active) err-unauthorized)
    (asserts! (is-authorized tx-sender) err-unauthorized)
    (asserts! (> (len currency-pair) u0) err-invalid-pair)
    (asserts! (>= rate min-rate) err-invalid-rate)
    (asserts! (<= rate max-rate) err-invalid-rate)

    ;; Store exchange rate
    (map-set exchange-rates
      { currency-pair: currency-pair }
      {
        rate: rate,
        updated-at: current-time,
        updater: tx-sender
      }
    )

    (ok true)
  )
)

;; Add authorized updater (owner only)
;; @param updater: Principal to authorize
;; @returns: Success boolean or error code
(define-public (add-authorized-updater (updater principal))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (map-set authorized-updaters
      { updater: updater }
      { authorized: true }
    )
    (ok true)
  )
)

;; Remove authorized updater (owner only)
;; @param updater: Principal to deauthorize
;; @returns: Success boolean or error code
(define-public (remove-authorized-updater (updater principal))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (map-set authorized-updaters
      { updater: updater }
      { authorized: false }
    )
    (ok true)
  )
)

;; Pause oracle (owner only)
;; @returns: Success boolean or error code
(define-public (pause-oracle)
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (var-set oracle-active false)
    (ok true)
  )
)

;; Unpause oracle (owner only)
;; @returns: Success boolean or error code
(define-public (unpause-oracle)
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (var-set oracle-active true)
    (ok true)
  )
)

;; Read-only Functions

;; Get contract owner
(define-read-only (get-contract-owner)
  contract-owner
)

;; Check if oracle is active
(define-read-only (is-active)
  (var-get oracle-active)
)

;; Get exchange rate for a currency pair
;; @param currency-pair: The currency pair to query
;; @returns: Exchange rate data or error if not found/stale
(define-read-only (get-exchange-rate (currency-pair (string-ascii 10)))
  (ok (unwrap! (map-get? exchange-rates { currency-pair: currency-pair }) err-not-found))
)

;; Get exchange rate with staleness check
;; @param currency-pair: The currency pair to query
;; @returns: Exchange rate data or error if not found/stale
(define-read-only (get-fresh-exchange-rate (currency-pair (string-ascii 10)))
  (let
    (
      (rate-data (unwrap! (map-get? exchange-rates { currency-pair: currency-pair }) err-not-found))
      (current-time (unwrap-panic (stacks-block-time)))
      (rate-age (- current-time (get updated-at rate-data)))
    )

    ;; Check if rate is fresh (not older than max-rate-age)
    (asserts! (<= rate-age max-rate-age) err-stale-price)

    (ok rate-data)
  )
)

;; Check if an address is authorized to update rates
;; @param updater: Principal to check
;; @returns: True if authorized, false otherwise
(define-read-only (is-authorized (updater principal))
  (if (is-eq updater contract-owner)
    true
    (default-to false (get authorized (map-get? authorized-updaters { updater: updater })))
  )
)

;; Get rate decimals (always 8)
(define-read-only (get-rate-decimals)
  rate-decimals
)

;; Get max rate age in seconds
(define-read-only (get-max-rate-age)
  max-rate-age
)
