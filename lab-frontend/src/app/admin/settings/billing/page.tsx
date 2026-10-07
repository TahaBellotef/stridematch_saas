"use client";

import React, { useState } from "react";
import SettingsToolbar from "../SettingsToolbar";
import { CreditCard, Receipt, Storefront, CurrencyDollar, CaretUp, CaretDown, DownloadSimple } from "@phosphor-icons/react";

export default function BillingSettings() {
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("card");
  const [name, setName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [cvvCode, setCvvCode] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement payment method save logic
    console.log({ selectedPaymentMethod, name, cardNumber, expiryDate, cvvCode });
  };

  const handleCancel = () => {
    setName("");
    setCardNumber("");
    setExpiryDate("");
    setCvvCode("");
  };

  const invoices = [
    { id: "IN-2025-124452", type: "Invoice", date: "Nov 7, 2025", amount: "29 EUR" },
    { id: "IN-2025-124452", type: "Invoice", date: "Nov 7, 2025", amount: "29 EUR" },
    { id: "IN-2025-124452", type: "Invoice", date: "Nov 7, 2025", amount: "29 EUR" },
  ];

  return (
    <div className="admin-page p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Outer Card */}
        <div 
          className="rounded-xl overflow-hidden" 
          style={{ 
            background: 'var(--sm-fill)',
            border: '1px solid rgba(0, 0, 0, 0.3)',
            boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.2)'
          }}
        >
          {/* Navigation Tabs */}
          <SettingsToolbar />
          
          {/* Content Area with Multiple Inner Cards */}
          <div className="p-4 sm:p-6 space-y-6" style={{ background: 'var(--sm-fill)' }}>
            {/* First Inner Card: Payment Method and Current Plan */}
            <div 
              className="rounded-xl p-5 sm:p-8" 
              style={{ 
                background: 'var(--sm-content)',
                border: '1px solid rgba(0, 0, 0, 0.3)',
                boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.2)'
              }}
            >
              {/* Payment Method and Current Plan */}
              <div className="flex flex-col lg:flex-row gap-8">
                {/* Payment Method Section */}
                <div style={{ flex: 1 }}>
                  <h2 className="text-xl font-semibold text-white mb-6">Payment Method</h2>
                  
                  {/* Payment Method Options */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                    <button
                      onClick={() => setSelectedPaymentMethod("card")}
                      className="p-6 rounded-xl flex flex-col items-center gap-3 transition-all"
                      style={{
                        background: 'var(--sm-fill)',
                        border: selectedPaymentMethod === "card"
                          ? '1px solid rgba(255, 255, 255, 0.2)'
                          : '1px solid rgba(0, 0, 0, 0.3)',
                        boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05)'
                      }}
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ background: '#312D4B' }}
                      >
                        <CreditCard size={20} className="text-white" />
                      </div>
                      <span className="text-white text-sm text-center">Credit / Debit / ATM Card</span>
                    </button>

                    <button
                      onClick={() => setSelectedPaymentMethod("cod")}
                      className="p-6 rounded-xl flex flex-col items-center gap-3 transition-all"
                      style={{
                        background: 'var(--sm-fill)',
                        border: selectedPaymentMethod === "cod"
                          ? '1px solid rgba(255, 255, 255, 0.2)'
                          : '1px solid rgba(0, 0, 0, 0.3)',
                        boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05)'
                      }}
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ background: '#312D4B' }}
                      >
                        <Receipt size={20} className="text-white" />
                      </div>
                      <span className="text-white text-sm text-center">COD / Cheque</span>
                    </button>
                  </div>

                  {/* Payment Form */}
                  <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Name */}
                    <div>
                      <label className="block text-white text-sm font-medium mb-2">
                        Name
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Type your name"
                        className="w-full text-white placeholder:text-gray-500 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                        style={{ 
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(0, 0, 0, 0.3)',
                          boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.2)'
                        }}
                      />
                    </div>

                    {/* Card Number */}
                    <div>
                      <label className="block text-white text-sm font-medium mb-2">
                        Card
                      </label>
                      <input
                        type="text"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        placeholder="Type your card number"
                        className="w-full text-white placeholder:text-gray-500 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                        style={{ 
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(0, 0, 0, 0.3)',
                          boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.2)'
                        }}
                      />
                    </div>

                    {/* Expiry Date and CVV Code */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-white text-sm font-medium mb-2">
                          Expiry Date
                        </label>
                        <input
                          type="text"
                          value={expiryDate}
                          onChange={(e) => setExpiryDate(e.target.value)}
                          placeholder="Type your expiry date"
                          className="w-full text-white placeholder:text-gray-500 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                          style={{ 
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(0, 0, 0, 0.3)',
                            boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.2)'
                          }}
                        />
                      </div>

                      <div>
                        <label className="block text-white text-sm font-medium mb-2">
                          CVV Code
                        </label>
                        <input
                          type="text"
                          value={cvvCode}
                          onChange={(e) => setCvvCode(e.target.value)}
                          placeholder="Type your cvv code"
                          className="w-full text-white placeholder:text-gray-500 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                          style={{ 
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(0, 0, 0, 0.3)',
                            boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.2)'
                          }}
                        />
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col sm:flex-row gap-4 pt-2">
                      <button
                          type="submit"
                          className="w-full sm:w-auto px-8 py-3 rounded-full font-medium transition-all hover:opacity-90"
                          style={{
                            background: 'linear-gradient(180deg, #4B21EF 0%, #6F4CF5 100%)',
                            border: '1px solid rgba(0, 0, 0, 0.3)',
                            boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.1), 0 4px 12px rgba(75, 33, 239, 0.3)',
                            color: '#FFFFFF'
                          }}
                        >
                          Save Changes
                        </button>
                      <button
                        type="button"
                        onClick={handleCancel}
                        className="w-full sm:w-auto px-8 py-3 rounded-full font-medium transition-all hover:opacity-80"
                        style={{
                          background: '#312D4B',
                          border: '1px solid rgba(0, 0, 0, 0.5)',
                          color: '#FFFFFF'
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>

                {/* Divider */}
                <div
                  className="hidden lg:block"
                  style={{
                    width: '1px',
                    backgroundColor: '#1F1F1F',
                    opacity: 0.15,
                    flexShrink: 0
                  }}
                />
                <div
                  className="block lg:hidden"
                  style={{
                    height: '1px',
                    backgroundColor: '#1F1F1F',
                    opacity: 0.15,
                    width: '100%'
                  }}
                />

                {/* Your Current Plan Section */}
                <div style={{ flex: 1 }}>
                  <h2 className="text-xl font-semibold text-white mb-6">Your Current Plan</h2>
                  
                  {/* Outer card with gradient border glow */}
                  <div
                    className="rounded-xl pt-[40px] px-[1.5px] pb-[1.5px]"
                    style={{
                      background: 'linear-gradient(180deg, #4A20EE 0%, #28243D 100%)',
                      width: '354.67px',
                      height: '480px',
                    }}
                  >
                    {/* Single inner card */}
                    <div
                      className="rounded-xl h-full text-center flex flex-col justify-center"
                      style={{
                        background: '#312D4B',
                        padding: '28px 24px',
                      }}
                    >
                        {/* Icon in rounded square */}
                        <div
                          className="w-10 h-10 mx-auto mb-3 rounded-xl flex items-center justify-center"
                          style={{
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.1)'
                          }}
                        >
                          <Storefront size={18} className="text-white" />
                        </div>
                        
                        <h3 className="text-lg font-semibold text-white mb-3">Essential</h3>
                        
                        {/* Divider */}
                        <div className="w-full mb-3" style={{ height: '1px', background: '#1F1F1F' }} />
                        
                        {/* Old price strikethrough */}
                        <div className="mb-1">
                          <span className="text-sm line-through" style={{ color: '#F14336' }}>349€/mois</span>
                        </div>
                        
                        {/* Current price */}
                        <div className="mb-1">
                          <span className="text-4xl font-semibold text-white">279€</span>
                          <span className="text-gray-400 ml-2 text-xs">HT / Mois</span>
                        </div>
                        
                        <p className="text-xs text-gray-400 mb-4">12-month commitment</p>
                        
                        <button
                          className="w-full px-6 py-2.5 rounded-full font-medium transition-all hover:opacity-90 text-sm"
                          style={{
                            background: 'linear-gradient(90deg, #3C3854 0%, #4B4474 100%)',
                            color: '#FFFFFF'
                          }}
                        >
                          Upgrade Plan
                        </button>

                        {/* Divider between Upgrade Plan and features */}
                        <div className="w-full mt-4" style={{ height: '1px', background: '#1F1F1F' }} />

                        {/* Features list */}
                        <div className="mt-3 space-y-2 text-left">
                          {['5 Users', '10 GB Storage', 'Basic Supports'].map((feature) => (
                            <div key={feature} className="flex items-center gap-2">
                              <div
                                className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
                              >
                                <svg width="8" height="6" viewBox="0 0 10 8" fill="none">
                                  <path d="M1 4L3.5 6.5L9 1" stroke="#A0A0B0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </div>
                              <span className="text-xs text-gray-400">{feature}</span>
                            </div>
                          ))}
                        </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Second Inner Card: Invoices */}
            <div 
              className="rounded-xl p-5 sm:p-8" 
              style={{ 
                background: 'var(--sm-content)',
                border: '1px solid rgba(0, 0, 0, 0.3)',
                boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.2)'
              }}
            >
              <h2 className="text-xl font-semibold text-white mb-6">Invoices</h2>

              {/* Header row */}
              <div
                className="rounded-xl px-6 py-3 mb-2 flex items-center"
                style={{
                  background: '#3C3854',
                  border: '1px solid rgba(0, 0, 0, 0.3)',
                  boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05)'
                }}
              >
                {['ID', 'Type', 'Date', 'Amount'].map((col) => (
                  <div key={col} className="flex items-center gap-1" style={{ flex: col === 'ID' ? 2 : 1 }}>
                    <span className="text-sm font-medium text-white">{col}</span>
                    <div className="flex flex-col">
                      <CaretUp size={10} className="text-gray-400" weight="bold" />
                      <CaretDown size={10} className="text-gray-400" weight="bold" />
                    </div>
                  </div>
                ))}
                <div style={{ width: '36px' }} />
              </div>

              {/* Invoice rows */}
              <div className="flex flex-col">
                {invoices.map((invoice, index) => (
                  <div key={index}>
                    <div className="flex items-center px-6 py-4">
                      <span className="text-sm text-white" style={{ flex: 2 }}>{invoice.id}</span>
                      <span className="text-sm text-white" style={{ flex: 1 }}>{invoice.type}</span>
                      <span className="text-sm text-white" style={{ flex: 1 }}>{invoice.date}</span>
                      <span className="text-sm text-white" style={{ flex: 1 }}>{invoice.amount}</span>
                      <button
                        className="p-2 rounded-full transition-all hover:opacity-80 flex-shrink-0"
                        style={{
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          width: '36px',
                          height: '36px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <DownloadSimple size={16} className="text-white" />
                      </button>
                    </div>
                    {index < invoices.length - 1 && (
                      <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', marginLeft: '24px', marginRight: '24px' }} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
