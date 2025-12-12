;; StackSend Oracle Contract
;; Price feed oracle for exchange rate management
;; Built with Clarity 4 for Stacks blockchain

;; Constants
(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u200))
(define-constant err-not-found (err u201))
(define-constant err-stale-price (err u202))
(define-constant err-invalid-price (err u203))

;; Maximum price age: 1 hour (in blocks, ~10 min per block = 6 blocks)
(define-constant max-price-age u6)

;; Data Variables
(define-data-var price-feed-active bool true)

;; Data Maps
;; Exchange rate storage
(define-map exchange-rates
  { currency-pair: (string-ascii 10) }
  {
    rate: uint,
    decimals: uint,
    updated-at: uint,
    oracle: principal
  }
)

;; Placeholder for future implementation
;; This contract will be developed across Days 6-7 as per PROJECT_PLAN.md

;; Read-only functions
(define-read-only (get-contract-owner)
  contract-owner
)

(define-read-only (is-active)
  (var-get price-feed-active)
)

;; This is a placeholder contract
;; Full implementation coming in subsequent issues
